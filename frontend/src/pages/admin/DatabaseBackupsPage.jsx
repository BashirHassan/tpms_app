import { useState, useEffect, useMemo } from 'react';
import backupsApi from '../../api/backups';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import { IconDatabase, IconDownload, IconRefresh } from '@tabler/icons-react';

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function DatabaseBackupsPage() {
  const { toast } = useToast();

  const [backups, setBackups]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [downloading, setDownloading] = useState(null);

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await backupsApi.getAll();
      setBackups(res.data.data || []);
    } catch {
      toast.error('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBackups(); }, []);

  const handleDownload = async (filename) => {
    setDownloading(filename);
    try {
      const res = await backupsApi.download(filename);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(null);
    }
  };

  const totalSize = backups.reduce((sum, b) => sum + b.size_bytes, 0);

  const columns = useMemo(() => [
    {
      accessor: 'filename',
      header: 'Filename',
      sortable: true,
      render: (v) => (
        <span className="font-mono text-sm text-gray-800">{v}</span>
      ),
    },
    {
      accessor: 'size_bytes',
      header: 'Size',
      sortable: true,
      render: (v) => <span className="text-gray-600">{formatBytes(v)}</span>,
    },
    {
      accessor: 'created_at',
      header: 'Created',
      sortable: true,
      render: (v) => <span className="text-gray-600">{formatDate(v)}</span>,
    },
    {
      accessor: 'actions',
      header: '',
      render: (_, row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleDownload(row.filename)}
          disabled={downloading === row.filename}
          icon={<IconDownload size={15} />}
        >
          {downloading === row.filename ? 'Downloading…' : 'Download'}
        </Button>
      ),
    },
  ], [downloading]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database Backups</h1>
          <p className="text-sm text-gray-500 mt-1">
            {backups.length} backup{backups.length !== 1 ? 's' : ''} · {formatBytes(totalSize)} total
          </p>
        </div>
        <Button
          variant="outline"
          onClick={fetchBackups}
          icon={<IconRefresh size={16} />}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      <DataTable
        data={backups}
        columns={columns}
        loading={loading}
        keyField="filename"
        sortable
        searchable
        searchPlaceholder="Search backups…"
        emptyIcon={IconDatabase}
        emptyTitle="No backups found"
        emptyDescription="Backups are created nightly at midnight."
      />
    </div>
  );
}
