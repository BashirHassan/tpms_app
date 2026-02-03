/**
 * Print PIN Page
 * Bulk and single student PIN printing for A4 and thermal printers
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentsApi, programsApi, sessionsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import {
  IconArrowLeft,
  IconPrinter,
  IconSearch,
  IconRefresh,
  IconUsers,
  IconLoader2,
} from '@tabler/icons-react';

function PrintPinPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const thermalPrintRef = useRef(null);
  const bulkPrintRef = useRef(null);

  // State
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0 });

  // Thermal print state
  const [thermalStudent, setThermalStudent] = useState(null);
  const [showThermalPreview, setShowThermalPreview] = useState(false);

  // Fetch students
  const fetchStudents = useCallback(async () => {
    if (!selectedSession) return;

    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (programFilter) params.program_id = programFilter;
      if (selectedSession) params.session_id = selectedSession;
      params.status = 'active'; // Only active students

      const response = await studentsApi.getAll(params);
      setStudents(response.data.data || response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (err) {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, programFilter, selectedSession, toast]);

  const fetchPrograms = async () => {
    try {
      const response = await programsApi.getAll({ status: 'active' });
      setPrograms(response.data.data || response.data || []);
    } catch (err) {
      console.error('Failed to load programs:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll({ status: 'active' });
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      if (sessionsData.length > 0) {
        const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  useEffect(() => {
    fetchPrograms();
    fetchSessions();
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Print A4 (bulk print all visible students)
  const handleBulkPrint = useCallback(() => {
    const printContent = bulkPrintRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student PINs - Bulk Print</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 10mm;
            background: white;
          }
          .print-header {
            text-align: center;
            margin-bottom: 8mm;
            padding-bottom: 4mm;
            border-bottom: 2px solid #333;
          }
          .print-header h1 {
            font-size: 18pt;
            margin-bottom: 2mm;
          }
          .print-header p {
            font-size: 10pt;
            color: #666;
          }
          .cards-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 4mm;
          }
          .pin-card {
            border: 1.5px solid #333;
            border-radius: 1mm;
            padding: 4mm;
            page-break-inside: avoid;
            background: white;
          }
          .pin-card .student-name {
            font-size: 8pt;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 1mm;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .pin-card .reg-number {
            font-size: 12pt;
            font-weight: 700;
            color: #000;
            font-family: 'Courier New', monospace;
            margin-bottom: 2mm;
          }
          .pin-card .pin-value {
            font-size: 16pt;
            font-weight: 700;
            letter-spacing: 2px;
            text-align: center;
            padding: 2mm 0;
            background: #f5f5f5;
            border-radius: 1mm;
            font-family: 'Courier New', monospace;
          }
          .pin-card .pin-label {
            font-size: 6pt;
            text-align: center;
            color: #2a2a2a;
            text-transform: uppercase;
          }
          @media print {
            body {
              padding: 5mm;
            }
            .cards-grid {
              gap: 3mm;
            }
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>Student Login PINs</h1>
          <p>Session: ${sessions.find(s => s.id.toString() === selectedSession)?.name || 'N/A'} | 
             Program: ${programFilter ? programs.find(p => p.id.toString() === programFilter)?.name : 'All Programs'} |
             Total: ${students.length} students</p>
        </div>
        <div class="cards-grid">
          ${students.map(student => `
            <div class="pin-card">
              <div class="student-name">${student.full_name}</div>
              <div class="reg-number">${student.registration_number}</div>
              <div class="pin-value">${student.pin || '----'}</div>
              <div class="pin-label">Login PIN</div>
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }, [students, sessions, selectedSession, programs, programFilter, toast]);

  // Print single student on thermal paper
  const handleThermalPrint = useCallback((student) => {
    setThermalStudent(student);
    setShowThermalPreview(true);
  }, []);

  const executeThermalPrint = useCallback(() => {
    if (!thermalStudent) return;

    const printWindow = window.open('', '_blank', 'width=600,height=500,scrollbars=yes,resizable=yes');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    // Thermal paper typically 58mm or 80mm width
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>PIN - ${thermalStudent.registration_number}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', monospace;
            width: 58mm;
            padding: 3mm;
            background: white;
          }
          .thermal-card {
            text-align: center;
            padding: 2mm 0;
          }
          .divider {
            border-top: 1px dashed #333;
            margin: 2mm 0;
          }
          .student-name {
            font-size: 10pt;
            font-weight: 700;
            text-transform: uppercase;
            word-wrap: break-word;
          }
          .reg-number {
            font-size: 12pt;
            font-weight: 700;
            color: #000;
            margin-bottom: 3mm;
          }
          .pin-label {
            font-size: 10pt;
            font-weight: 600;
            text-transform: uppercase;
            color: #000;
          }
          .pin-value {
            font-size: 20pt;
            font-weight: 900;
            letter-spacing: 3px;
            margin-bottom: 2mm;
          }
          .footer {
            font-size: 10pt;
            font-weight: 600;
            text-transform: uppercase;
            color: #000;
          }
          @media print {
            body {
              width: 80mm;
            }
          }
          @page {
            size: 80mm auto;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="thermal-card">
          <div class="divider"></div>
          <div class="student-name">${thermalStudent.full_name}</div>
          <div class="reg-number">${thermalStudent.registration_number}</div>
          <div class="divider"></div>
          <div class="pin-label">Your Login PIN</div>
          <div class="pin-value">${thermalStudent.pin || '----'}</div>
          <div class="divider"></div>
          <div class="footer">Keep this PIN secure</div>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      setShowThermalPreview(false);
      setThermalStudent(null);
    }, 250);
  }, [thermalStudent, toast]);

  // Close thermal preview
  const closeThermalPreview = useCallback(() => {
    setShowThermalPreview(false);
    setThermalStudent(null);
  }, []);

  // Filter reset
  const resetFilters = useCallback(() => {
    setSearch('');
    setProgramFilter('');
    setPagination(p => ({ ...p, page: 1 }));
  }, []);

  // Load more
  const loadMore = useCallback(() => {
    setPagination(p => ({ ...p, limit: p.limit + 100 }));
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/students')}
            className="active:scale-95"
          >
            <IconArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Print Student PINs</h1>
            <p className="text-xs sm:text-sm text-gray-500">
              Preview and print student login PINs
            </p>
          </div>
        </div>
        <Button
          onClick={handleBulkPrint}
          disabled={loading || students.length === 0}
          className="active:scale-95"
        >
          <IconPrinter className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Print All ({students.length})</span>
          <span className="sm:hidden">Print</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((p) => ({ ...p, page: 1 }));
              }}
              placeholder="Search by name or reg number..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Session Filter */}
          <Select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="text-sm sm:w-48"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} {session.is_current && '(Current)'}
              </option>
            ))}
          </Select>

          {/* Program Filter */}
          <Select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="text-sm sm:w-48"
          >
            <option value="">All Programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          {/* Reset */}
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="active:scale-95"
          >
            <IconRefresh className="w-4 h-4" />
          </Button>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-500">
          Showing {students.length} of {pagination.total} students
          {pagination.total > students.length && (
            <Button
              variant="link"
              size="sm"
              onClick={loadMore}
              className="ml-2"
            >
              Load more
            </Button>
          )}
        </div>
      </div>

      {/* PIN Cards Grid - Print Preview */}
      <div
        ref={bulkPrintRef}
        className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <IconLoader2 className="w-8 h-8 text-primary-500 animate-spin" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <IconUsers className="w-12 h-12 mb-3 text-gray-300" />
            <p className="font-medium">No students found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {students.map((student) => (
              <div
                key={student.id}
                className="relative group border border-gray-200 rounded-lg p-3 hover:border-primary-300 hover:shadow-md transition-all bg-white"
              >
                {/* Thermal Print Icon */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleThermalPrint(student)}
                  className="absolute top-2 right-2 !p-1.5 !h-auto !w-auto rounded-full bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-primary-100 hover:text-primary-600 transition-all"
                  title="Print single (thermal)"
                >
                  <IconPrinter className="w-3.5 h-3.5" />
                </Button>

                {/* Student Info */}
                <div className="text-xs font-semibold text-gray-900 uppercase truncate pr-6" title={student.full_name}>
                  {student.full_name}
                </div>
                <div className="text-[10px] text-gray-800 font-mono truncate mt-0.5" title={student.registration_number}>
                  {student.registration_number}
                </div>

                {/* PIN - Primary Content */}
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <div className="text-center">
                    <div className="text-[9px] uppercase text-gray-400 tracking-wider">PIN</div>
                    <div className="text-lg sm:text-xl font-bold text-primary-700 tracking-widest font-mono">
                      {student.pin || '----'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Thermal Print Preview Modal */}
      {showThermalPreview && thermalStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Thermal Print Preview</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeThermalPreview}
                className="text-gray-400 hover:text-gray-600 !h-8 !w-8"
              >
                &times;
              </Button>
            </div>

            {/* Thermal Paper Preview */}
            <div className="p-6 flex justify-center">
              <div
                ref={thermalPrintRef}
                className="w-[58mm] bg-white border-2 border-dashed border-gray-300 p-3 font-mono text-center"
                style={{ minHeight: '80mm' }}
              >
                <div className="border-t border-dashed border-gray-400 pt-2 mb-2"></div>
                <div className="text-xs font-bold uppercase break-words">
                  {thermalStudent.full_name}
                </div>
                <div className="text-[10px] text-gray-800 mt-1">
                  {thermalStudent.registration_number}
                </div>
                <div className="border-t border-dashed border-gray-400 my-3"></div>
                <div className="text-[9px] uppercase text-gray-800">Your Login PIN</div>
                <div className="text-3xl font-black tracking-[4px]">
                  {thermalStudent.pin || '----'}
                </div>
                <div className="border-t border-dashed border-gray-400 my-3"></div>
                <div className="text-[8px] text-gray-400">Keep this PIN secure</div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 p-4 border-t bg-gray-50 rounded-b-lg">
              <Button
                variant="outline"
                className="flex-1"
                onClick={closeThermalPreview}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={executeThermalPrint}
              >
                <IconPrinter className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PrintPinPage;
