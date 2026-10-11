import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addContainer,
  BabyBitesDb,
  BackupValidationError,
  buildInventoryGroups,
  createBackup,
  deleteContainer,
  deleteRecipe,
  emptySelectedContainers,
  loadSnapshot,
  parseBackup,
  restoreBackup,
  saveBatch,
  saveRecipe,
  ValidationError
} from './db';

let database: BabyBitesDb;
let databaseName: string;

beforeEach(() => {
  databaseName = 'babybites-test-' + Math.random().toString(36).slice(2);
  database = new BabyBitesDb(databaseName);
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe('BabyBites data operations', () => {
  it('creates exactly 24 empty containers on a first launch', async () => {
    const snapshot = await loadSnapshot(database);

    expect(snapshot.containers).toHaveLength(24);
    expect(snapshot.containers.every((container) => container.recipeId === null)).toBe(true);
    expect(snapshot.containers.map((container) => container.number)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1)
    );
  });

  it('adds and edits recipes while rejecting duplicate names', async () => {
    const first = await saveRecipe({ name: 'Wortel patatjes', remarks: 'Eerste versie' }, database);
    const edited = await saveRecipe(
      { id: first.id, name: 'Wortel & patatjes', remarks: 'Met extra wortel.' },
      database
    );

    expect(edited.id).toBe(first.id);
    expect(edited.name).toBe('Wortel & patatjes');
    await saveRecipe({ name: 'Broccoli', remarks: '' }, database);
    await expect(
      saveRecipe({ name: '  broccoli  ', remarks: 'Dubbel' }, database)
    ).rejects.toThrow('bestaat al');
  });

  it('saves individual weights in one batch and protects the referenced recipe', async () => {
    const recipe = await saveRecipe(
      { name: 'Wortel patatjes', remarks: 'Eli vindt dit lekker.' },
      database
    );

    await saveBatch(
      {
        recipeId: recipe.id,
        preparationDate: '2026-10-11',
        containers: [
          { containerNumber: 1, weightGrams: 50 },
          { containerNumber: 3, weightGrams: 60 }
        ]
      },
      database
    );

    const snapshot = await loadSnapshot(database);
    expect(snapshot.containers[0].weightGrams).toBe(50);
    expect(snapshot.containers[2].weightGrams).toBe(60);
    await expect(deleteRecipe(recipe.id, database)).rejects.toThrow(
      'nog gevulde potjes'
    );

    await expect(
      saveBatch(
        {
          recipeId: recipe.id,
          preparationDate: '2026-10-12',
          containers: [{ containerNumber: 1, weightGrams: 55 }]
        },
        database
      )
    ).rejects.toThrow('intussen al gevuld');
  });

  it('groups recipes in oldest-first order and clears selected containers for reuse', async () => {
    const newer = await saveRecipe({ name: 'Nieuwere puree', remarks: '' }, database);
    const older = await saveRecipe({ name: 'Oudere puree', remarks: '' }, database);

    await saveBatch(
      {
        recipeId: newer.id,
        preparationDate: '2026-10-10',
        containers: [{ containerNumber: 4, weightGrams: 50 }]
      },
      database
    );
    await saveBatch(
      {
        recipeId: older.id,
        preparationDate: '2026-10-01',
        containers: [
          { containerNumber: 1, weightGrams: 40 },
          { containerNumber: 2, weightGrams: 60 }
        ]
      },
      database
    );

    let snapshot = await loadSnapshot(database);
    const groups = buildInventoryGroups(snapshot.recipes, snapshot.containers);
    expect(groups.map((group) => group.recipe.name)).toEqual(['Oudere puree', 'Nieuwere puree']);
    expect(groups[0].totalWeightGrams).toBe(100);
    expect(groups[0].containers.map((container) => container.number)).toEqual([1, 2]);

    await emptySelectedContainers([1, 2], database);
    snapshot = await loadSnapshot(database);
    expect(snapshot.containers[0].recipeId).toBeNull();
    expect(snapshot.containers[1].weightGrams).toBeNull();

    await saveBatch(
      {
        recipeId: older.id,
        preparationDate: '2026-10-11',
        containers: [{ containerNumber: 1, weightGrams: 55 }]
      },
      database
    );
    expect((await loadSnapshot(database)).containers[0].weightGrams).toBe(55);
  });

  it('adds and removes empty containers without renumbering, but blocks filled ones', async () => {
    const recipe = await saveRecipe({ name: 'Pastinaak', remarks: '' }, database);
    const addedNumber = await addContainer(database);
    expect(addedNumber).toBe(25);

    await deleteContainer(25, database);
    expect((await loadSnapshot(database)).containers).toHaveLength(24);

    await saveBatch(
      {
        recipeId: recipe.id,
        preparationDate: '2026-10-11',
        containers: [{ containerNumber: 24, weightGrams: 70 }]
      },
      database
    );
    await expect(deleteContainer(24, database)).rejects.toThrow(ValidationError);
  });

  it('validates a backup before replacing any current data, then restores a valid one', async () => {
    const recipe = await saveRecipe({ name: 'Broccoli', remarks: '' }, database);
    const before = await createBackup(database);

    expect(() =>
      parseBackup(
        JSON.stringify({
          ...before,
          containers: [
            {
              number: 1,
              recipeId: recipe.id,
              preparationDate: null,
              weightGrams: null
            }
          ]
        })
      )
    ).toThrow(BackupValidationError);

    expect(await createBackup(database)).toMatchObject({
      recipes: before.recipes,
      containers: before.containers
    });

    await restoreBackup(parseBackup(JSON.stringify(before)), database);
    const after = await createBackup(database);
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
  });

  it('keeps data after a database reopen', async () => {
    await saveRecipe({ name: 'Courgette', remarks: 'Test' }, database);
    database.close();
    database = new BabyBitesDb(databaseName);

    const snapshot = await loadSnapshot(database);
    expect(snapshot.recipes).toHaveLength(1);
    expect(snapshot.recipes[0].name).toBe('Courgette');
    expect(snapshot.containers).toHaveLength(24);
  });
});
