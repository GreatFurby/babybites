import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Edit3,
  FileDown,
  FileUp,
  Info,
  PackageCheck,
  Plus,
  Scale,
  Share2,
  Snowflake,
  Trash2,
  X
} from 'lucide-react';
import {
  buildInventoryGroups,
  isEmpty,
  isFilled,
  parseBackup,
  type BackupValidationError
} from './db';
import { formatDate, formatGrams, todayLocalISO } from './date';
import type {
  BackupFile,
  BatchInput,
  ContainerRecord,
  InventoryGroup,
  RecipeInput,
  RecipeRecord
} from './types';

interface DialogProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

function Dialog({ title, children, onClose }: DialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Sluiten"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'normal';
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = 'normal',
  onConfirm,
  onClose
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    try {
      setBusy(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={title} onClose={busy ? () => undefined : onClose}>
      <div className="dialog-body">
        <div className="dialog-message">
          <AlertTriangle size={23} />
          <p>{message}</p>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>
            Annuleren
          </button>
          <button
            type="button"
            className={'button ' + (tone === 'danger' ? 'button-danger' : 'button-primary')}
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Even wachten…' : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Er ging iets mis. Probeer het gerust opnieuw.';
}

function recipeName(recipeId: string | null, recipes: RecipeRecord[]): string {
  return recipes.find((recipe) => recipe.id === recipeId)?.name ?? 'Onbekend recept';
}

function pluralizePotjes(amount: number): string {
  return amount === 1 ? 'potje' : 'potjes';
}

export function InventoryScreen({
  recipes,
  containers,
  onStartEntry
}: {
  recipes: RecipeRecord[];
  containers: ContainerRecord[];
  onStartEntry: () => void;
}) {
  const groups = buildInventoryGroups(recipes, containers);
  const [selectedGroup, setSelectedGroup] = useState<InventoryGroup | null>(null);

  if (selectedGroup) {
    const latestGroup = groups.find((group) => group.recipe.id === selectedGroup.recipe.id);
    if (!latestGroup) {
      setSelectedGroup(null);
      return null;
    }

    return (
      <section className="detail-screen">
        <button type="button" className="back-button" onClick={() => setSelectedGroup(null)}>
          <ChevronLeft size={21} />
          Terug naar voorraad
        </button>
        <div className="detail-heading">
          <p className="eyebrow">In de diepvries</p>
          <h2>{latestGroup.recipe.name}</h2>
          <p>{latestGroup.containers.length} {pluralizePotjes(latestGroup.containers.length)} · {formatGrams(latestGroup.totalWeightGrams)}</p>
        </div>
        <div className="container-detail-grid">
          {latestGroup.containers.map((container) => (
            <article key={container.number} className="container-detail-card">
              <span className="pot-number">{container.number}</span>
              <div>
                <strong>Potje {container.number}</strong>
                <span>{formatDate(container.preparationDate)}</span>
              </div>
              <span className="weight-pill">{formatGrams(container.weightGrams ?? 0)}</span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="section-intro">
        <div>
          <p className="eyebrow">Overzicht</p>
          <h2>Wat ligt er in de diepvries?</h2>
        </div>
        <span className="count-bubble">{containers.filter(isFilled).length} gevuld</span>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="empty-illustration"><Snowflake size={36} /></span>
          <h3>De diepvries is leeg</h3>
          <p>Voeg een bereide portie toe en je vindt ze hier per recept terug.</p>
          <button type="button" className="button button-primary" onClick={onStartEntry}>
            <Plus size={19} />
            Nieuwe ingave
          </button>
        </div>
      ) : (
        <div className="inventory-list">
          {groups.map((group) => (
            <button
              key={group.recipe.id}
              type="button"
              className="inventory-card"
              onClick={() => setSelectedGroup(group)}
            >
              <span className="recipe-icon"><Archive size={24} /></span>
              <span className="inventory-card-copy">
                <strong>{group.recipe.name}</strong>
                <span>
                  {group.containers.length} {pluralizePotjes(group.containers.length)}
                  {' · '}{formatGrams(group.totalWeightGrams)}
                </span>
                <small>Oudste: {formatDate(group.oldestPreparationDate)}</small>
              </span>
              <ArrowRight size={20} className="card-arrow" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function RecipesScreen({
  recipes,
  onSaveRecipe,
  onDeleteRecipe
}: {
  recipes: RecipeRecord[];
  onSaveRecipe: (input: RecipeInput) => Promise<RecipeRecord>;
  onDeleteRecipe: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<RecipeRecord | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RecipeRecord | null>(null);

  return (
    <section>
      <div className="section-intro section-intro-action">
        <div>
          <p className="eyebrow">Jouw favorieten</p>
          <h2>Recepten</h2>
        </div>
        <button type="button" className="button button-primary compact-button" onClick={() => setEditing('new')}>
          <Plus size={18} />
          Toevoegen
        </button>
      </div>

      {recipes.length === 0 ? (
        <div className="empty-state small-empty-state">
          <span className="empty-illustration"><Archive size={32} /></span>
          <h3>Nog geen recepten</h3>
          <p>Voeg eerst een recept toe. Daarna kun je potjes invullen.</p>
        </div>
      ) : (
        <div className="recipe-list">
          {recipes.map((recipe) => (
            <article key={recipe.id} className="recipe-card">
              <div className="recipe-card-copy">
                <h3>{recipe.name}</h3>
                {recipe.remarks ? <p>{recipe.remarks}</p> : <p className="muted">Geen opmerkingen.</p>}
              </div>
              <div className="card-actions">
                <button type="button" className="icon-button" aria-label={recipe.name + ' aanpassen'} onClick={() => setEditing(recipe)}>
                  <Edit3 size={19} />
                </button>
                <button type="button" className="icon-button danger-icon" aria-label={recipe.name + ' verwijderen'} onClick={() => setDeleting(recipe)}>
                  <Trash2 size={19} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <RecipeEditor
          recipe={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await onSaveRecipe(input);
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Recept verwijderen?"
          message={'“' + deleting.name + '” wordt verwijderd als er geen gevuld potje meer aan gekoppeld is.'}
          confirmLabel="Verwijderen"
          tone="danger"
          onClose={() => setDeleting(null)}
          onConfirm={() => onDeleteRecipe(deleting.id)}
        />
      )}
    </section>
  );
}

function RecipeEditor({
  recipe,
  onSave,
  onClose
}: {
  recipe: RecipeRecord | null;
  onSave: (input: RecipeInput) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(recipe?.name ?? '');
  const [remarks, setRemarks] = useState(recipe?.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true);
      setError(null);
      await onSave({ id: recipe?.id, name, remarks });
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={recipe ? 'Recept aanpassen' : 'Nieuw recept'} onClose={busy ? () => undefined : onClose}>
      <form className="dialog-body form-stack" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Naam</span>
          <input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Bijvoorbeeld wortel patatjes" />
        </label>
        <label>
          <span>Opmerkingen</span>
          <textarea rows={4} maxLength={500} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optioneel: wat werkte goed, wat pas je volgende keer aan?" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Annuleren</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewEntryScreen({
  recipes,
  containers,
  onSaveBatch
}: {
  recipes: RecipeRecord[];
  containers: ContainerRecord[];
  onSaveBatch: (input: BatchInput) => Promise<void>;
}) {
  const [recipeId, setRecipeId] = useState('');
  const [preparationDate, setPreparationDate] = useState(todayLocalISO);
  const [defaultWeight, setDefaultWeight] = useState('50');
  const [selectedWeights, setSelectedWeights] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emptyContainers = containers.filter(isEmpty).sort((left, right) => left.number - right.number);
  const selectedEntries = Object.entries(selectedWeights)
    .map(([number, weight]) => ({ containerNumber: Number(number), weight }))
    .sort((left, right) => left.containerNumber - right.containerNumber);

  const toggleContainer = (number: number) => {
    setError(null);
    setSelectedWeights((previous) => {
      if (String(number) in previous) {
        const next = { ...previous };
        delete next[number];
        return next;
      }
      return { ...previous, [number]: defaultWeight };
    });
  };

  const setIndividualWeight = (number: number, weight: string) => {
    setSelectedWeights((previous) => ({ ...previous, [number]: weight }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setError(null);
      const parsedDefault = Number(defaultWeight.replace(',', '.'));
      if (!recipeId) {
        throw new Error('Kies eerst een recept.');
      }
      if (!preparationDate) {
        throw new Error('Kies een bereidingsdatum.');
      }
      if (!Number.isFinite(parsedDefault) || parsedDefault <= 0) {
        throw new Error('Geef een geldig standaardgewicht in.');
      }
      if (selectedEntries.length === 0) {
        throw new Error('Tik minstens één leeg potje aan.');
      }

      const batch: BatchInput = {
        recipeId,
        preparationDate,
        containers: selectedEntries.map((entry) => ({
          containerNumber: entry.containerNumber,
          weightGrams: Number(entry.weight.replace(',', '.'))
        }))
      };

      setBusy(true);
      await onSaveBatch(batch);
      setRecipeId('');
      setPreparationDate(todayLocalISO());
      setDefaultWeight('50');
      setSelectedWeights({});
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="section-intro">
        <div>
          <p className="eyebrow">Nieuwe porties</p>
          <h2>Potjes invullen</h2>
          <p className="intro-copy">Kies het recept, tik de gevulde potjes aan en pas alleen afwijkende gewichten aan.</p>
        </div>
      </div>

      {recipes.length === 0 ? (
        <div className="empty-state small-empty-state">
          <span className="empty-illustration"><Info size={32} /></span>
          <h3>Voeg eerst een recept toe</h3>
          <p>Zodra er een recept bestaat, kun je een bereiding invoeren.</p>
        </div>
      ) : emptyContainers.length === 0 ? (
        <div className="empty-state small-empty-state">
          <span className="empty-illustration"><Archive size={32} /></span>
          <h3>Alle potjes zijn gevuld</h3>
          <p>Maak eerst een of meer potjes leeg of voeg een nieuw potje toe via Instellingen.</p>
        </div>
      ) : (
        <form className="entry-form" onSubmit={(event) => void submit(event)}>
          <div className="form-card form-grid">
            <label className="full-width">
              <span>Recept</span>
              <select required value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
                <option value="">Kies een recept…</option>
                {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.name}</option>)}
              </select>
            </label>
            <label>
              <span>Bereidingsdatum</span>
              <span className="input-with-icon">
                <CalendarDays size={18} />
                <input required type="date" value={preparationDate} onChange={(event) => setPreparationDate(event.target.value)} />
              </span>
            </label>
            <label>
              <span>Standaardgewicht</span>
              <span className="input-with-icon">
                <Scale size={18} />
                <input required min="0.1" step="0.1" inputMode="decimal" type="number" value={defaultWeight} onChange={(event) => setDefaultWeight(event.target.value)} />
                <em>g</em>
              </span>
            </label>
          </div>

          <div className="selection-heading">
            <div>
              <h3>Welke potjes heb je gevuld?</h3>
              <p>Alleen lege potjes staan hieronder.</p>
            </div>
            <span className="selected-count">{selectedEntries.length} gekozen</span>
          </div>

          <div className="container-picker" aria-label="Lege potjes">
            {emptyContainers.map((container) => {
              const selected = String(container.number) in selectedWeights;
              return (
                <button
                  key={container.number}
                  type="button"
                  className={'container-choice' + (selected ? ' is-selected' : '')}
                  aria-pressed={selected}
                  onClick={() => toggleContainer(container.number)}
                >
                  <span>{container.number}</span>
                  {selected && <Check size={15} />}
                </button>
              );
            })}
          </div>

          {selectedEntries.length > 0 && (
            <div className="selected-weights-card">
              <div className="selection-heading narrow-heading">
                <div>
                  <h3>Gewicht per potje</h3>
                  <p>Pas alleen aan wat afwijkt.</p>
                </div>
              </div>
              <div className="selected-weights-list">
                {selectedEntries.map((entry) => (
                  <label key={entry.containerNumber} className="weight-row">
                    <span>Potje <strong>{entry.containerNumber}</strong></span>
                    <span className="inline-weight-input">
                      <input
                        aria-label={'Gewicht potje ' + entry.containerNumber}
                        min="0.1"
                        step="0.1"
                        inputMode="decimal"
                        type="number"
                        value={entry.weight}
                        onChange={(event) => setIndividualWeight(entry.containerNumber, event.target.value)}
                      />
                      <em>g</em>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary full-button" disabled={busy}>
            <PackageCheck size={20} />
            {busy ? 'Opslaan…' : selectedEntries.length === 0 ? 'Kies minstens één potje' : selectedEntries.length + ' ' + pluralizePotjes(selectedEntries.length) + ' opslaan'}
          </button>
        </form>
      )}
    </section>
  );
}

export function EmptyContainersScreen({
  recipes,
  containers,
  onEmptyContainers
}: {
  recipes: RecipeRecord[];
  containers: ContainerRecord[];
  onEmptyContainers: (numbers: number[]) => Promise<void>;
}) {
  const filledContainers = containers.filter(isFilled).sort((left, right) => left.number - right.number);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const toggle = (number: number) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };

  return (
    <section>
      <div className="section-intro">
        <div>
          <p className="eyebrow">Na het eten</p>
          <h2>Potjes leegmaken</h2>
          <p className="intro-copy">Kies de potjes die leeg zijn. Hun inhoud wordt niet bewaard.</p>
        </div>
      </div>

      {filledContainers.length === 0 ? (
        <div className="empty-state small-empty-state">
          <span className="empty-illustration"><Snowflake size={32} /></span>
          <h3>Geen gevulde potjes</h3>
          <p>Er is niets om leeg te maken.</p>
        </div>
      ) : (
        <>
          <div className="filled-container-list">
            {filledContainers.map((container) => {
              const selectedItem = selected.has(container.number);
              return (
                <button
                  key={container.number}
                  type="button"
                  className={'filled-container-card' + (selectedItem ? ' is-selected' : '')}
                  aria-pressed={selectedItem}
                  onClick={() => toggle(container.number)}
                >
                  <span className="selection-indicator">{selectedItem && <Check size={15} />}</span>
                  <span className="pot-number">{container.number}</span>
                  <span className="filled-copy">
                    <strong>{recipeName(container.recipeId, recipes)}</strong>
                    <span>{formatGrams(container.weightGrams ?? 0)} · {formatDate(container.preparationDate)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="button button-danger full-button sticky-screen-action"
            disabled={selected.size === 0}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={20} />
            {selected.size === 0 ? 'Kies potjes om leeg te maken' : selected.size + ' ' + pluralizePotjes(selected.size) + ' leegmaken'}
          </button>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title="Potjes leegmaken?"
          message={'Je maakt ' + selected.size + ' ' + pluralizePotjes(selected.size) + ' leeg. De inhoud, datum en het gewicht worden permanent verwijderd.'}
          confirmLabel="Ja, leegmaken"
          tone="danger"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            await onEmptyContainers([...selected]);
            setSelected(new Set());
          }}
        />
      )}
    </section>
  );
}

type ShareNavigator = Navigator & {
  canShare?: (data?: ShareData) => boolean;
};

export function SettingsScreen({
  containers,
  onAddContainer,
  onDeleteContainer,
  onCreateBackup,
  onRestoreBackup
}: {
  containers: ContainerRecord[];
  onAddContainer: () => Promise<number>;
  onDeleteContainer: (number: number) => Promise<void>;
  onCreateBackup: () => Promise<BackupFile>;
  onRestoreBackup: (backup: BackupFile) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContainerRecord | null>(null);
  const [pendingRestore, setPendingRestore] = useState<BackupFile | null>(null);
  const sortedContainers = [...containers].sort((left, right) => left.number - right.number);

  const add = async () => {
    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      await onAddContainer();
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const shareBackup = async () => {
    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      const backup = await onCreateBackup();
      const filename = 'BabyBites-backup-' + todayLocalISO() + '.json';
      const file = new File([JSON.stringify(backup, null, 2)], filename, {
        type: 'application/json'
      });
      const sharingNavigator = navigator as ShareNavigator;

      if (
        typeof sharingNavigator.share === 'function' &&
        (!sharingNavigator.canShare || sharingNavigator.canShare({ files: [file] }))
      ) {
        await sharingNavigator.share({
          title: 'BabyBites back-up',
          text: 'Back-up van BabyBites',
          files: [file]
        });
        setSuccess('Deelmenu geopend. Bewaar het bestand bijvoorbeeld in je e-mail.');
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(file);
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        setSuccess('De back-up is gedownload.');
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        return;
      }
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  const selectRestoreFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      setSuccess(null);
      setPendingRestore(parseBackup(await file.text()));
    } catch (reason) {
      setError(messageFrom(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="section-intro">
        <div>
          <p className="eyebrow">BabyBites beheren</p>
          <h2>Instellingen</h2>
        </div>
      </div>

      <section className="settings-section">
        <div className="settings-heading">
          <div>
            <h3>Potjes beheren</h3>
            <p>{containers.length} geconfigureerde {pluralizePotjes(containers.length)}</p>
          </div>
          <button type="button" className="button button-secondary compact-button" disabled={busy} onClick={() => void add()}>
            <Plus size={18} />
            Potje toevoegen
          </button>
        </div>
        <div className="settings-container-grid">
          {sortedContainers.map((container) => {
            const filled = isFilled(container);
            return (
              <article key={container.number} className={'managed-container' + (filled ? ' is-filled' : '')}>
                <span className="managed-number">{container.number}</span>
                <span>{filled ? 'Gevuld' : 'Leeg'}</span>
                <button
                  type="button"
                  className="tiny-delete"
                  disabled={filled || busy}
                  title={filled ? 'Een gevuld potje kan niet verwijderd worden.' : 'Potje verwijderen'}
                  aria-label={'Potje ' + container.number + ' verwijderen'}
                  onClick={() => setDeleting(container)}
                >
                  <Trash2 size={15} />
                </button>
              </article>
            );
          })}
        </div>
        <p className="helper-copy">Een gevuld potje kan niet verwijderd worden. De nummers op je fysieke labels blijven altijd behouden.</p>
      </section>

      <section className="settings-section backup-section">
        <div className="settings-heading">
          <div>
            <h3>Back-up en herstel</h3>
            <p>Bewaar af en toe één JSON-bestand, bijvoorbeeld in je eigen e-mail.</p>
          </div>
        </div>
        <div className="backup-actions">
          <button type="button" className="button button-primary" disabled={busy} onClick={() => void shareBackup()}>
            <Share2 size={19} />
            Back-up delen
          </button>
          <button type="button" className="button button-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            <FileUp size={19} />
            Back-up herstellen
          </button>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void selectRestoreFile(event)}
          />
        </div>
        <div className="backup-note">
          <FileDown size={18} />
          <span>Een herstel vervangt de huidige recepten en voorraad volledig.</span>
        </div>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="success-copy" role="status">{success}</p>}

      {deleting && (
        <ConfirmDialog
          title="Potje verwijderen?"
          message={'Potje ' + deleting.number + ' is leeg en wordt uit BabyBites verwijderd. Andere potnummers veranderen niet.'}
          confirmLabel="Potje verwijderen"
          tone="danger"
          onClose={() => setDeleting(null)}
          onConfirm={() => onDeleteContainer(deleting.number)}
        />
      )}
      {pendingRestore && (
        <ConfirmDialog
          title="Back-up herstellen?"
          message={'De huidige ' + containers.length + ' potjes, recepten en voorraad worden volledig vervangen door deze back-up. Dit kun je niet ongedaan maken.'}
          confirmLabel="Ja, herstellen"
          tone="danger"
          onClose={() => setPendingRestore(null)}
          onConfirm={() => onRestoreBackup(pendingRestore)}
        />
      )}
    </section>
  );
}
