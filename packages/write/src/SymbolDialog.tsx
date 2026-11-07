import { DialogFrame } from '@free360/ui';
import styles from './SymbolDialog.module.css';

const SYMBOL_GROUPS = [
  { label: 'Punctuation', symbols: '–—…•·‘’“”«»¡¿§¶†‡' },
  { label: 'Legal and currency', symbols: '©®™°€£¥¢₹₽' },
  { label: 'Math', symbols: '±×÷≠≈≤≥∞√∑∏∫πµΩ∆½¼¾²³' },
  { label: 'Arrows and shapes', symbols: '←→↑↓↔⇒★☆✓✗■□●○◆♥' },
  { label: 'Accented letters', symbols: 'áéíóúñüçàèìòùâêîôûäëïöåæøßÁÉÍÓÚÑÜÇ' },
];

type SymbolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (symbol: string) => void;
};

export function SymbolDialog({ open, onOpenChange, onPick }: SymbolDialogProps) {
  return (
    <DialogFrame open={open} onOpenChange={onOpenChange} title="Insert a symbol">
      {SYMBOL_GROUPS.map(({ label, symbols }) => (
        <section key={label} className={styles.group}>
          <h3 className={styles.heading}>{label}</h3>
          <div className={styles.grid}>
            {Array.from(symbols).map((symbol) => (
              <button
                key={symbol}
                type="button"
                className={styles.symbol}
                aria-label={`Insert ${symbol}`}
                onClick={() => {
                  onPick(symbol);
                  onOpenChange(false);
                }}
              >
                {symbol}
              </button>
            ))}
          </div>
        </section>
      ))}
    </DialogFrame>
  );
}
