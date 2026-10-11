import Dexie, { type Table } from 'dexie';
import { isValidDateKey } from './date';
import type {
  BackupFile,
  BatchInput,
  ContainerRecord,
  InventoryGroup,
  RecipeInput,
  RecipeRecord
} from './types';

export const BACKUP_FORMAT_VERSION = 1 as const;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export class BabyBitesDb extends Dexie {
  recipes!: Table<RecipeRecord, string>;
  containers!: Table<ContainerRecord, number>;

  constructor(name = 'babybites') {
    super(name);

    this.version(1).stores({
      recipes: 'id, &nameKey',
      containers: 'number, recipeId'
    });

    this.recipes = this.table('recipes');
    this.containers = this.table('containers');

    this.on('populate', () => this.containers.bulkAdd(createInitialContainers()));
  }
}

export const db = new BabyBitesDb();

export function createInitialContainers(): ContainerRecord[] {
  return Array.from({ length: 24 }, (_, index) => emptyContainer(index + 1));
}

export function emptyContainer(number: number): ContainerRecord {
  return {
    number,
    recipeId: null,
    preparationDate: null,
    weightGrams: null
  };
}

export function isFilled(container: ContainerRecord): boolean {
  return (
    typeof container.recipeId === 'string' &&
    container.recipeId.length > 0 &&
    isValidDateKey(container.preparationDate) &&
    isValidWeight(container.weightGrams)
  );
}

export function isEmpty(container: ContainerRecord): boolean {
  return (
    container.recipeId === null &&
    container.preparationDate === null &&
    container.weightGrams === null
  );
}

export function isValidWeight(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function normalizeRecipeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl-BE');
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'recipe-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

export async function loadSnapshot(database = db): Promise<{
  recipes: RecipeRecord[];
  containers: ContainerRecord[];
}> {
  const [recipes, containers] = await Promise.all([
    database.recipes.toArray(),
    database.containers.toArray()
  ]);

  return {
    recipes: recipes.sort((left, right) => left.name.localeCompare(right.name, 'nl-BE')),
    containers: containers.sort((left, right) => left.number - right.number)
  };
}

export function buildInventoryGroups(
  recipes: RecipeRecord[],
  containers: ContainerRecord[]
): InventoryGroup[] {
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const groups = new Map<string, ContainerRecord[]>();

  for (const container of containers) {
    if (!isFilled(container) || !container.recipeId || !recipeById.has(container.recipeId)) {
      continue;
    }

    const current = groups.get(container.recipeId) ?? [];
    current.push(container);
    groups.set(container.recipeId, current);
  }

  return [...groups.entries()]
    .map(([recipeId, groupContainers]) => {
      const sortedContainers = [...groupContainers].sort(
        (left, right) =>
          left.preparationDate!.localeCompare(right.preparationDate!) ||
          left.number - right.number
      );

      return {
        recipe: recipeById.get(recipeId)!,
        containers: sortedContainers,
        totalWeightGrams: sortedContainers.reduce(
          (total, container) => total + (container.weightGrams ?? 0),
          0
        ),
        oldestPreparationDate: sortedContainers[0].preparationDate!
      };
    })
    .sort(
      (left, right) =>
        left.oldestPreparationDate.localeCompare(right.oldestPreparationDate) ||
        left.recipe.name.localeCompare(right.recipe.name, 'nl-BE')
    );
}

export async function saveRecipe(input: RecipeInput, database = db): Promise<RecipeRecord> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const remarks = input.remarks.trim();
  const nameKey = normalizeRecipeName(name);

  if (!name) {
    throw new ValidationError('Geef het recept een naam.');
  }

  const sameName = await database.recipes.where('nameKey').equals(nameKey).first();
  if (sameName && sameName.id !== input.id) {
    throw new ValidationError('Er bestaat al een recept met deze naam.');
  }

  if (input.id) {
    const existing = await database.recipes.get(input.id);
    if (!existing) {
      throw new ValidationError('Dit recept bestaat niet meer.');
    }

    const updated: RecipeRecord = {
      id: existing.id,
      name,
      remarks,
      nameKey
    };
    await database.recipes.put(updated);
    return updated;
  }

  const recipe: RecipeRecord = {
    id: createId(),
    name,
    remarks,
    nameKey
  };
  await database.recipes.add(recipe);
  return recipe;
}

export async function deleteRecipe(id: string, database = db): Promise<void> {
  await database.transaction('rw', database.recipes, database.containers, async () => {
    const recipe = await database.recipes.get(id);
    if (!recipe) {
      throw new ValidationError('Dit recept bestaat niet meer.');
    }

    const linkedContainer = await database.containers.where('recipeId').equals(id).first();
    if (linkedContainer) {
      throw new ValidationError(
        'Dit recept kan niet verwijderd worden omdat er nog gevulde potjes aan gekoppeld zijn.'
      );
    }

    await database.recipes.delete(id);
  });
}

export async function saveBatch(input: BatchInput, database = db): Promise<void> {
  if (!input.recipeId) {
    throw new ValidationError('Kies eerst een recept.');
  }
  if (!isValidDateKey(input.preparationDate)) {
    throw new ValidationError('Kies een geldige bereidingsdatum.');
  }
  if (input.containers.length === 0) {
    throw new ValidationError('Kies minstens één leeg potje.');
  }

  const numbers = new Set<number>();
  for (const entry of input.containers) {
    if (!Number.isInteger(entry.containerNumber) || entry.containerNumber < 1) {
      throw new ValidationError('Een gekozen potje is ongeldig.');
    }
    if (!isValidWeight(entry.weightGrams)) {
      throw new ValidationError('Elk gekozen potje heeft een geldig gewicht nodig.');
    }
    if (numbers.has(entry.containerNumber)) {
      throw new ValidationError('Een potje kan maar één keer in dezelfde ingave staan.');
    }
    numbers.add(entry.containerNumber);
  }

  await database.transaction('rw', database.recipes, database.containers, async () => {
    const recipe = await database.recipes.get(input.recipeId);
    if (!recipe) {
      throw new ValidationError('Het gekozen recept bestaat niet meer.');
    }

    const selectedContainers = await Promise.all(
      input.containers.map((entry) => database.containers.get(entry.containerNumber))
    );
    if (selectedContainers.some((container) => !container)) {
      throw new ValidationError('Een gekozen potje bestaat niet meer.');
    }
    if (selectedContainers.some((container) => container && !isEmpty(container))) {
      throw new ValidationError('Een gekozen potje is intussen al gevuld. Probeer opnieuw.');
    }

    await Promise.all(
      input.containers.map((entry) =>
        database.containers.update(entry.containerNumber, {
          recipeId: input.recipeId,
          preparationDate: input.preparationDate,
          weightGrams: entry.weightGrams
        })
      )
    );
  });
}

export async function emptySelectedContainers(
  numbers: number[],
  database = db
): Promise<void> {
  const uniqueNumbers = [...new Set(numbers)];
  if (uniqueNumbers.length === 0) {
    throw new ValidationError('Kies minstens één gevuld potje.');
  }

  await database.transaction('rw', database.containers, async () => {
    const selectedContainers = await Promise.all(
      uniqueNumbers.map((number) => database.containers.get(number))
    );
    if (selectedContainers.some((container) => !container || !isFilled(container))) {
      throw new ValidationError('Een gekozen potje is niet meer gevuld. Vernieuw de lijst.');
    }

    await Promise.all(
      uniqueNumbers.map((number) =>
        database.containers.update(number, {
          recipeId: null,
          preparationDate: null,
          weightGrams: null
        })
      )
    );
  });
}

export async function getNextContainerNumber(database = db): Promise<number> {
  const existingNumbers = new Set((await database.containers.toArray()).map((item) => item.number));
  let nextNumber = 1;
  while (existingNumbers.has(nextNumber)) {
    nextNumber += 1;
  }
  return nextNumber;
}

export async function addContainer(database = db): Promise<number> {
  const number = await getNextContainerNumber(database);
  await database.containers.add(emptyContainer(number));
  return number;
}

export async function deleteContainer(number: number, database = db): Promise<void> {
  await database.transaction('rw', database.containers, async () => {
    const container = await database.containers.get(number);
    if (!container) {
      throw new ValidationError('Dit potje bestaat niet meer.');
    }
    if (!isEmpty(container)) {
      throw new ValidationError(
        'Dit potje kan niet verwijderd worden omdat het nog gevuld is.'
      );
    }
    await database.containers.delete(number);
  });
}

export async function createBackup(database = db): Promise<BackupFile> {
  const snapshot = await loadSnapshot(database);

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    recipes: snapshot.recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      remarks: recipe.remarks
    })),
    containers: snapshot.containers.map((container) => ({
      number: container.number,
      recipeId: container.recipeId,
      preparationDate: container.preparationDate,
      weightGrams: container.weightGrams
    }))
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBackupRecipe(value: unknown): BackupFile['recipes'][number] {
  if (!isPlainObject(value)) {
    throw new BackupValidationError('Een recept in de back-up is ongeldig.');
  }

  if (
    typeof value.id !== 'string' ||
    !value.id.trim() ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.remarks !== 'string'
  ) {
    throw new BackupValidationError('Een recept in de back-up mist geldige gegevens.');
  }

  return {
    id: value.id,
    name: value.name.trim().replace(/\s+/g, ' '),
    remarks: value.remarks
  };
}

function readBackupContainer(value: unknown): BackupFile['containers'][number] {
  if (!isPlainObject(value)) {
    throw new BackupValidationError('Een potje in de back-up is ongeldig.');
  }

  const number = value.number;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    throw new BackupValidationError('Een potje in de back-up is ongeldig.');
  }

  const recipeId = value.recipeId;
  const preparationDate = value.preparationDate;
  const weightGrams = value.weightGrams;
  const isEmptyContainer =
    recipeId === null && preparationDate === null && weightGrams === null;
  const isFilledContainer =
    typeof recipeId === 'string' &&
    recipeId.length > 0 &&
    isValidDateKey(preparationDate) &&
    isValidWeight(weightGrams);

  if (!isEmptyContainer && !isFilledContainer) {
    throw new BackupValidationError(
      'Een potje in de back-up moet volledig leeg of volledig gevuld zijn.'
    );
  }

  return {
    number,
    recipeId: recipeId as string | null,
    preparationDate: preparationDate as string | null,
    weightGrams: weightGrams as number | null
  };
}

export function parseBackup(text: string): BackupFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupValidationError('Dit bestand is geen geldige JSON-back-up.');
  }

  if (!isPlainObject(value)) {
    throw new BackupValidationError('Dit bestand heeft geen geldig back-upformaat.');
  }
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError('Deze back-upversie wordt niet ondersteund.');
  }
  if (typeof value.exportedAt !== 'string' || !value.exportedAt) {
    throw new BackupValidationError('De back-up bevat geen geldige exportdatum.');
  }
  if (!Array.isArray(value.recipes) || !Array.isArray(value.containers)) {
    throw new BackupValidationError('De back-up mist recepten of potjes.');
  }

  const recipes = value.recipes.map(readBackupRecipe);
  const containers = value.containers.map(readBackupContainer);
  const recipeIds = new Set<string>();
  const recipeNames = new Set<string>();
  for (const recipe of recipes) {
    const key = normalizeRecipeName(recipe.name);
    if (recipeIds.has(recipe.id) || recipeNames.has(key)) {
      throw new BackupValidationError('De back-up bevat dubbele recepten.');
    }
    recipeIds.add(recipe.id);
    recipeNames.add(key);
  }

  const containerNumbers = new Set<number>();
  for (const container of containers) {
    if (containerNumbers.has(container.number)) {
      throw new BackupValidationError('De back-up bevat dubbele potnummers.');
    }
    containerNumbers.add(container.number);
    if (container.recipeId && !recipeIds.has(container.recipeId)) {
      throw new BackupValidationError(
        'Een gevuld potje verwijst naar een recept dat niet in de back-up staat.'
      );
    }
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: value.exportedAt,
    recipes,
    containers
  };
}

export async function restoreBackup(backup: BackupFile, database = db): Promise<void> {
  await database.transaction('rw', database.recipes, database.containers, async () => {
    await database.recipes.clear();
    await database.containers.clear();

    await database.recipes.bulkAdd(
      backup.recipes.map((recipe) => ({
        ...recipe,
        nameKey: normalizeRecipeName(recipe.name)
      }))
    );
    await database.containers.bulkAdd(backup.containers);
  });
}
