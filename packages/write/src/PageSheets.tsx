import type { PageSetup } from './pageSetup';
import styles from './PageSheets.module.css';

export type SheetFootnote = { number: number; text: string; page: number };

type PageSheetsProps = {
  setup: PageSetup;
  pageCount: number;
  footnotes: SheetFootnote[];
};

function Zone({
  className,
  text,
  pageNumber,
}: {
  className: string;
  text: string;
  pageNumber?: number;
}) {
  if (!text && pageNumber === undefined) return null;
  return (
    <div className={className}>
      <span>{text}</span>
      {pageNumber !== undefined && <span>{pageNumber}</span>}
    </div>
  );
}

/** The paper behind the text, with each page's header and footer. */
export function PageSheets({ setup, pageCount, footnotes }: PageSheetsProps) {
  return (
    <div aria-hidden>
      {Array.from({ length: pageCount }, (_, index) => {
        const notes = footnotes.filter((note) => note.page === index + 1);
        return (
          <div
            key={index}
            className={`${styles.sheet} fs-sheet`}
            style={{
              top: `calc(${index} * (var(--fs-page-height) + var(--fs-sheet-gap)))`,
            }}
          >
            <Zone
              className={`${styles.zone} ${styles.header} fs-page-header`}
              text={setup.headerText}
              pageNumber={setup.pageNumbers === 'header' ? index + 1 : undefined}
            />
            <Zone
              className={`${styles.zone} ${styles.footer} fs-page-footer`}
              text={setup.footerText}
              pageNumber={setup.pageNumbers === 'footer' ? index + 1 : undefined}
            />
            {notes.length > 0 && (
              <div className={`${styles.notes} fs-footnotes`}>
                {notes.map((note) => (
                  <div key={note.number} className="fs-footnote-line">
                    {note.number}. {note.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
