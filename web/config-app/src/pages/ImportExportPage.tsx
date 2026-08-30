import { ImportExport } from '../components/import/ImportExport';

export function ImportExportPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-accent mb-2">BBS Import/Export</h1>
        <p className="text-bbs-muted">Import data from classic Amiga BBS or export current BBS data</p>
      </div>

      <ImportExport />
    </div>
  );
}
