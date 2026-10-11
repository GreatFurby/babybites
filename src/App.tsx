import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Baby,
  BookOpen,
  Boxes,
  Check,
  CircleAlert,
  Plus,
  Settings,
  Trash2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  addContainer,
  createBackup,
  db,
  deleteContainer,
  deleteRecipe,
  emptySelectedContainers,
  loadSnapshot,
  restoreBackup,
  saveBatch,
  saveRecipe,
  type BabyBitesDb
} from './db';
import type {
  AppTab,
  BackupFile,
  BatchInput,
  ContainerRecord,
  RecipeInput,
  RecipeRecord
} from './types';
import {
  EmptyContainersScreen,
  InventoryScreen,
  NewEntryScreen,
  RecipesScreen,
  SettingsScreen
} from './screens';

interface Snapshot {
  recipes: RecipeRecord[];
  containers: ContainerRecord[];
}

interface Toast {
  id: number;
  message: string;
}

const navItems: Array<{ id: AppTab; label: string; icon: LucideIcon }> = [
  { id: 'inventory', label: 'Voorraad', icon: Archive },
  { id: 'recipes', label: 'Recepten', icon: BookOpen },
  { id: 'new-entry', label: 'Nieuwe ingave', icon: Plus },
  { id: 'empty-containers', label: 'Pot leegmaken', icon: Trash2 },
  { id: 'settings', label: 'Instellingen', icon: Settings }
];

const titles: Record<AppTab, string> = {
  inventory: 'Voorraad',
  recipes: 'Recepten',
  'new-entry': 'Nieuwe ingave',
  'empty-containers': 'Pot leegmaken',
  settings: 'Instellingen'
};

function messageFrom(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Er ging iets mis. Probeer het gerust opnieuw.';
}

export default function App({ database = db }: { database?: BabyBitesDb }) {
  const [activeTab, setActiveTab] = useState<AppTab>('inventory');
  const [snapshot, setSnapshot] = useState<Snapshot>({ recipes: [], containers: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ id: Date.now(), message });
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoadError(null);
      setSnapshot(await loadSnapshot(database));
    } catch (error) {
      setLoadError(
        'BabyBites kon de lokale gegevens niet openen. ' + messageFrom(error)
      );
    } finally {
      setLoading(false);
    }
  }, [database]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSaveRecipe = async (input: RecipeInput) => {
    const recipe = await saveRecipe(input, database);
    await refresh();
    showToast(input.id ? 'Recept aangepast.' : 'Recept toegevoegd.');
    return recipe;
  };

  const handleDeleteRecipe = async (id: string) => {
    await deleteRecipe(id, database);
    await refresh();
    showToast('Recept verwijderd.');
  };

  const handleSaveBatch = async (input: BatchInput) => {
    await saveBatch(input, database);
    await refresh();
    showToast('De potjes zijn toegevoegd aan de voorraad.');
  };

  const handleEmptyContainers = async (numbers: number[]) => {
    await emptySelectedContainers(numbers, database);
    await refresh();
    showToast(numbers.length === 1 ? 'Potje leeggemaakt.' : 'Potjes leeggemaakt.');
  };

  const handleAddContainer = async () => {
    const number = await addContainer(database);
    await refresh();
    showToast('Potje ' + number + ' toegevoegd.');
    return number;
  };

  const handleDeleteContainer = async (number: number) => {
    await deleteContainer(number, database);
    await refresh();
    showToast('Potje ' + number + ' verwijderd.');
  };

  const handleRestoreBackup = async (backup: BackupFile) => {
    await restoreBackup(backup, database);
    await refresh();
    showToast('De back-up is hersteld.');
  };

  const renderScreen = () => {
    if (loading) {
      return (
        <section className="loading-state" aria-live="polite">
          <span className="loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          BabyBites wordt klaargezet…
        </section>
      );
    }

    switch (activeTab) {
      case 'inventory':
        return (
          <InventoryScreen
            recipes={snapshot.recipes}
            containers={snapshot.containers}
            onStartEntry={() => setActiveTab('new-entry')}
          />
        );
      case 'recipes':
        return (
          <RecipesScreen
            recipes={snapshot.recipes}
            onSaveRecipe={handleSaveRecipe}
            onDeleteRecipe={handleDeleteRecipe}
          />
        );
      case 'new-entry':
        return (
          <NewEntryScreen
            recipes={snapshot.recipes}
            containers={snapshot.containers}
            onSaveBatch={handleSaveBatch}
          />
        );
      case 'empty-containers':
        return (
          <EmptyContainersScreen
            recipes={snapshot.recipes}
            containers={snapshot.containers}
            onEmptyContainers={handleEmptyContainers}
          />
        );
      case 'settings':
        return (
          <SettingsScreen
            containers={snapshot.containers}
            onAddContainer={handleAddContainer}
            onDeleteContainer={handleDeleteContainer}
            onCreateBackup={() => createBackup(database)}
            onRestoreBackup={handleRestoreBackup}
          />
        );
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            <Baby size={22} strokeWidth={2.4} />
          </span>
          <div>
            <p className="eyebrow">Babyvoeding in de diepvries</p>
            <h1>BabyBites</h1>
          </div>
        </div>
        <span className="screen-title">{titles[activeTab]}</span>
      </header>

      <main className="screen-content">
        {loadError && (
          <div className="error-banner" role="alert">
            <CircleAlert size={20} />
            <span>{loadError}</span>
            <button type="button" className="text-button" onClick={() => void refresh()}>
              Opnieuw proberen
            </button>
          </div>
        )}
        {renderScreen()}
      </main>

      <nav className="bottom-nav" aria-label="Hoofdnavigatie">
        {navItems.map((item) => {
          const Icon = item.icon;
          const selected = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              className={'nav-item' + (selected ? ' is-active' : '')}
              aria-current={selected ? 'page' : undefined}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={22} strokeWidth={selected ? 2.6 : 2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {toast && (
        <div key={toast.id} className="toast" role="status">
          <Check size={19} />
          {toast.message}
        </div>
      )}
    </div>
  );
}
