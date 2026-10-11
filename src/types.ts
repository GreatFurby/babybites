export type DateKey = string;

export interface RecipeRecord {
  id: string;
  name: string;
  remarks: string;
  nameKey: string;
}

export interface ContainerRecord {
  number: number;
  recipeId: string | null;
  preparationDate: DateKey | null;
  weightGrams: number | null;
}

export interface RecipeInput {
  id?: string;
  name: string;
  remarks: string;
}

export interface BatchContainerInput {
  containerNumber: number;
  weightGrams: number;
}

export interface BatchInput {
  recipeId: string;
  preparationDate: DateKey;
  containers: BatchContainerInput[];
}

export interface InventoryGroup {
  recipe: RecipeRecord;
  containers: ContainerRecord[];
  totalWeightGrams: number;
  oldestPreparationDate: DateKey;
}

export interface BackupRecipe {
  id: string;
  name: string;
  remarks: string;
}

export interface BackupContainer {
  number: number;
  recipeId: string | null;
  preparationDate: DateKey | null;
  weightGrams: number | null;
}

export interface BackupFile {
  formatVersion: 1;
  exportedAt: string;
  recipes: BackupRecipe[];
  containers: BackupContainer[];
}

export type AppTab =
  | 'inventory'
  | 'recipes'
  | 'new-entry'
  | 'empty-containers'
  | 'settings';
