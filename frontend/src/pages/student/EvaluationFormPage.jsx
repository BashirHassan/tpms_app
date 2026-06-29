/**
 * Evaluation Form Page (Student)
 * View and print the evaluation form to carry to the assigned school.
 * Access is controlled by the same posting_letter_available_date gate
 * and requires an approved acceptance form.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { sanitizeHtml } from '../../utils/sanitize';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/helpers';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  DocumentLetterhead,
  DocumentContainer,
  DocumentFooter,
  DocumentPrintStyles,
  TemplateBodyStyles,
  DateBlock,
  StudentInfoTable,
  SignatureBlock,
} from '../../components/documents/DocumentPreview';
import {
  IconPrinter,
  IconRefresh,
  IconAlertCircle,
  IconClipboardList,
  IconClock,
  IconArrowLeft,
} from '@tabler/icons-react';

function EvaluationFormPage() {
  const navigate = useNavigate();
  const { institution } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [documentData, setDocumentData] = useState(null);
  const [templateHtml, setTemplateHtml] = useState(null);
  const [error, setError] = useState(null);
  const [availabilityInfo, setAvailabilityInfo] = useState(null);
  const [postingLetterWindow, setPostingLetterWindow] = useState(null);

  const fetchPortalStatus = async () => {
    try {
      const response = await portalApi.getStatus();
      const portal = response.data.data;
      if (portal?.windows?.posting_letter) {
        setPostingLetterWindow(portal.windows.posting_letter);
      }
    } catch (err) {
      console.error('Failed to fetch portal status:', err);
    }
  };

  useEffect(() => {
    fetchDocumentData();
    fetchPortalStatus();
  }, []);

  const fetchDocumentData = async () => {
    setLoading(true);
    setError(null);
    setAvailabilityInfo(null);
    try {
      const response = await portalApi.renderDocument('evaluation_form');
      const data = response.data.data || response.data || {};
      setDocumentData(data);
      setTemplateHtml(data.html);
    } catch (err) {
      console.error('Failed to load evaluation form:', err);
      if (err.response?.status === 404) {
        setError('not_found');
      } else if (err.response?.status === 403) {
        setError('not_available');
        if (err.response?.data?.data?.available_from) {
          setAvailabilityInfo({ availableFrom: err.response.data.data.available_from });
        }
      } else {
        setError('error');
        toast.error('Failed to load evaluation form');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => window.print();

  const currentDate = new Date().toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px] px-4">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-primary-200 border-t-primary-600"></div>
          <p className="text-gray-500 text-sm sm:text-base">Loading evaluation form...</p>
        </div>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconClipboardList className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Evaluation Form Not Available</h2>
            <p className="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">
              Your evaluation form is not available at this time.
              Please ensure you have submitted your acceptance form.
            </p>
            {postingLetterWindow?.starts_at && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                <p className="text-xs sm:text-sm text-blue-800 flex items-center justify-center gap-1.5">
                  <IconClock className="w-4 h-4" />
                  <span>
                    <strong>Available from:</strong>{' '}
                    {new Date(postingLetterWindow.starts_at).toLocaleDateString('en-NG', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </p>
              </div>
            )}
            <Button onClick={fetchDocumentData} variant="outline" className="active:scale-95">
              <IconRefresh className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error === 'not_available') {
    const availableFromDate = availabilityInfo?.availableFrom || postingLetterWindow?.starts_at;
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconClock className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-2">Evaluation Form Not Yet Available</h2>
            {availableFromDate && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                <p className="text-xs sm:text-sm text-yellow-800 flex items-center justify-center gap-1.5">
                  <IconClock className="w-4 h-4" />
                  <span>
                    <strong>Available from:</strong>{' '}
                    {new Date(availableFromDate).toLocaleDateString('en-NG', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error === 'error') {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconAlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Unable to Load</h2>
            <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
              There was an error loading your evaluation form. Please try again.
            </p>
            <Button onClick={fetchDocumentData} className="active:scale-95">
              <IconRefresh className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const student = documentData?.student;
  const session = documentData?.session;
  const coordinator = {
    name: session?.coordinator_name,
    phone: session?.coordinator_phone,
    email: session?.coordinator_email,
  };
  const school = documentData?.school;

  return (
    <div className="space-y-3 sm:space-y-4 px-1">
      {/* Action Buttons — hidden on print */}
      <div className="flex items-center justify-between gap-2 max-w-[210mm] mx-auto print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Evaluation Form</h1>
          {session && (
            <p className="text-xs sm:text-sm text-gray-500 truncate">Session: {session.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="active:scale-95">
            <IconArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <Button variant="outline" size="sm" onClick={fetchDocumentData} className="active:scale-95">
            <IconRefresh className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button variant="primary" size="sm" onClick={handlePrint} className="active:scale-95">
            <IconPrinter className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Print</span>
          </Button>
        </div>
      </div>

      {/* Printable Document */}
      <div className="print-document">
        <DocumentPrintStyles containerClass="print-document" />
        <TemplateBodyStyles />

        <DocumentContainer institution={institution} showWatermark={false} className="print:p-0">
          <DocumentLetterhead
            institution={institution}
            showContacts={true}
            session={session}
            variant="full"
          />

          {templateHtml ? (
            <div
              className="template-body text-sm"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(templateHtml) }}
            />
          ) : (
            /* Fallback static evaluation form */
            <>
              <DateBlock date={currentDate} />

              <h2
                className="text-center font-bold text-base mb-1 uppercase tracking-wide"
                style={{ color: institution?.primary_color || '#0c5b32', textDecoration: 'underline' }}
              >
                STUDENT-TEACHER EVALUATION FORM
              </h2>
              <p className="text-center text-xs text-gray-500 mb-4">
                Teaching Practice — {session?.name || new Date().getFullYear()}
              </p>

              {/* Student details */}
              <StudentInfoTable
                student={student}
                session={session}
                institution={institution}
                variant="striped"
              />

              {/* Assigned school */}
              {school && (
                <div className="mt-4 mb-4 p-3 border border-gray-200 rounded text-sm">
                  <p className="font-semibold mb-1">School of Assignment</p>
                  <p>{school.name}</p>
                  {school.address && <p className="text-gray-600">{school.address}</p>}
                  {school.lga && <p className="text-gray-600">{school.lga} L.G.A, {school.state} State</p>}
                </div>
              )}

              {/* Evaluation grid */}
              <p className="text-xs text-gray-500 mb-2 mt-4">
                To be completed by the Principal/Head Teacher at the end of each visit. Score out of the maximum indicated.
              </p>
              <table className="w-full border-collapse text-sm mb-6" style={{ fontSize: '11px' }}>
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 p-2 text-left font-semibold w-8">S/N</th>
                    <th className="border border-gray-300 p-2 text-left font-semibold">Criteria</th>
                    <th className="border border-gray-300 p-2 text-center font-semibold w-16">Max</th>
                    <th className="border border-gray-300 p-2 text-center font-semibold w-20">Visit 1</th>
                    <th className="border border-gray-300 p-2 text-center font-semibold w-20">Visit 2</th>
                    <th className="border border-gray-300 p-2 text-center font-semibold w-20">Visit 3</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { sn: 1, label: 'Lesson Plan / Note Preparation', max: 15 },
                    { sn: 2, label: 'Lesson Delivery & Communication', max: 20 },
                    { sn: 3, label: 'Classroom Management & Discipline', max: 15 },
                    { sn: 4, label: 'Content Mastery & Accuracy', max: 20 },
                    { sn: 5, label: 'Use of Instructional Materials', max: 10 },
                    { sn: 6, label: 'Student Participation & Engagement', max: 10 },
                    { sn: 7, label: 'Punctuality & Attendance', max: 5 },
                    { sn: 8, label: 'General Conduct & Professional Ethics', max: 5 },
                  ].map(({ sn, label, max }) => (
                    <tr key={sn} className={sn % 2 === 0 ? 'bg-gray-50' : ''}>
                      <td className="border border-gray-300 p-2 text-center">{sn}</td>
                      <td className="border border-gray-300 p-2">{label}</td>
                      <td className="border border-gray-300 p-2 text-center font-medium">{max}</td>
                      <td className="border border-gray-300 p-2 text-center"></td>
                      <td className="border border-gray-300 p-2 text-center"></td>
                      <td className="border border-gray-300 p-2 text-center"></td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-gray-100">
                    <td colSpan={2} className="border border-gray-300 p-2 text-right">Total</td>
                    <td className="border border-gray-300 p-2 text-center">100</td>
                    <td className="border border-gray-300 p-2 text-center"></td>
                    <td className="border border-gray-300 p-2 text-center"></td>
                    <td className="border border-gray-300 p-2 text-center"></td>
                  </tr>
                </tbody>
              </table>

              {/* Remarks */}
              <div className="mb-6">
                <p className="font-semibold text-sm mb-1">Remarks / Observations:</p>
                <div className="border-b border-gray-400 mb-2 h-6"></div>
                <div className="border-b border-gray-400 mb-2 h-6"></div>
                <div className="border-b border-gray-400 h-6"></div>
              </div>

              {/* Principal signature */}
              <div className="grid grid-cols-2 gap-8 mt-6 text-sm">
                <div>
                  <p className="font-semibold mb-6">Principal/Head Teacher:</p>
                  <div className="border-b border-gray-400 mb-1"></div>
                  <p className="text-xs text-gray-500">Name &amp; Signature</p>
                  <div className="border-b border-gray-400 mt-4 mb-1"></div>
                  <p className="text-xs text-gray-500">Date</p>
                  <div className="border-b border-gray-400 mt-4 mb-1"></div>
                  <p className="text-xs text-gray-500">Official Stamp</p>
                </div>
                <SignatureBlock
                  name={coordinator?.name || '____________________'}
                  title="Teaching Practice Coordinator"
                  phone={coordinator?.phone}
                  email={coordinator?.email}
                  showDate={false}
                />
              </div>
            </>
          )}

          <DocumentFooter institution={institution} session={session} showCoordinator={false} />
        </DocumentContainer>
      </div>
    </div>
  );
}

export default EvaluationFormPage;
