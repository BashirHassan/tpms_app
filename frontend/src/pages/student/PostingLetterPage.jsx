/**
 * Posting Letter Page (Student)
 * View and print posting letter for confirmed school placement
 * 
 * Uses the template system for body content while keeping React-based header/footer
 * Access is controlled by the session's posting_letters_available_from date
 */

import { useState, useEffect } from 'react';
import { portalApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
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
  AddressBlock,
  StudentInfoTable,
  SignatureBlock,
} from '../../components/documents/DocumentPreview';
import {
  IconPrinter,
  IconRefresh,
  IconAlertCircle,
  IconFileText,
  IconClock,
} from '@tabler/icons-react';

function PostingLetterPage() {
  const { institution } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [documentData, setDocumentData] = useState(null);
  const [templateHtml, setTemplateHtml] = useState(null);
  const [error, setError] = useState(null);
  const [availabilityInfo, setAvailabilityInfo] = useState(null);
  const [postingLetterWindow, setPostingLetterWindow] = useState(null);

  // Fetch portal status for availability date info
  const fetchPortalStatus = async () => {
    try {
      const response = await portalApi.getStatus();
      const portal = response.data.data;
      if (portal?.windows?.posting_letter) {
        setPostingLetterWindow(portal.windows.posting_letter);
      }
    } catch (err) {
      // Silent fail - this is supplementary info
      console.error('Failed to fetch portal status:', err);
    }
  };

  // Fetch document data on mount
  useEffect(() => {
    fetchDocumentData();
    fetchPortalStatus();
  }, []);

  const fetchDocumentData = async () => {
    setLoading(true);
    setError(null);
    setAvailabilityInfo(null);
    try {
      // Try to get template-rendered document
      const response = await portalApi.renderDocument('posting_letter');
      const data = response.data.data || response.data || {};
      
      setDocumentData(data);
      setTemplateHtml(data.html); // May be null if no template exists
    } catch (err) {
      console.error('Failed to load posting letter:', err);
      if (err.response?.status === 404) {
        setError('not_found');
      } else if (err.response?.status === 403) {
        setError('not_available');
        // Extract availability info from response if present
        if (err.response?.data?.available_from) {
          setAvailabilityInfo({
            availableFrom: err.response.data.available_from,
          });
        }
      } else {
        setError('error');
        toast.error('Failed to load posting letter');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Generate reference number
  const getReference = () => {
    const student = documentData?.student;
    const session = documentData?.session;
    return `TP/PL/${session?.code || new Date().getFullYear()}/${student?.registration_number?.replace(/\//g, '-') || ''}`;
  };

  // Format date with long month format for documents
  const formatDateLong = (dateStr) => formatDate(dateStr, { month: 'long' }, '_____________________');

  const currentDate = new Date().toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px] px-4">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-primary-200 border-t-primary-600"></div>
          <p className="text-gray-500 text-sm sm:text-base">Loading posting letter...</p>
        </div>
      </div>
    );
  }

  // Error: Not found (no posting letter generated yet - acceptance not submitted)
  if (error === 'not_found') {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconFileText className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Posting Letter Not Available</h2>
            <p className="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">
              Your posting letter is not available at this time.
              Please ensure you have submitted your acceptance form.
            </p>
            {postingLetterWindow?.starts_at && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                <p className="text-xs sm:text-sm text-blue-800 flex items-center justify-center gap-1.5">
                  <IconClock className="w-4 h-4" />
                  <span>
                    <strong>Posting letters available from:</strong>{' '}
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

  // Error: Not available (posting letter availability date not reached)
  if (error === 'not_available') {
    const availableFromDate = availabilityInfo?.availableFrom || postingLetterWindow?.starts_at;
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconClock className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
            </div>
            <h2 className="font-semibold text-gray-900 mb-2">Posting Letter Not Yet Available For Download</h2>
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

  // Error: General error
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
              There was an error loading your posting letter. Please try again.
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
  const coordinator = documentData?.coordinator || {
    name: session?.coordinator_name,
    phone: session?.coordinator_phone,
    email: session?.coordinator_email,
  };
  const placeholderData = documentData?.placeholderData || {};
  const reference = getReference();

  // Extract school info from placeholder data
  const school = placeholderData?.school || {};
  const posting = placeholderData?.posting || {};

  return (
    <div className="space-y-3 sm:space-y-4 px-1">
      {/* Action Buttons - Hidden on Print */}
      <div className="flex items-center justify-between gap-2 max-w-[210mm] mx-auto print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Posting Letter</h1>
          {session && (
            <p className="text-xs sm:text-sm text-gray-500 truncate">Session: {session.name}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
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
        {/* Shared Print Styles */}
        <DocumentPrintStyles containerClass="print-document" />
        <TemplateBodyStyles />

        <DocumentContainer 
          institution={institution}
          showWatermark={true}
          className="print:p-0"
        >
          <DocumentLetterhead 
            institution={institution}
            showContacts={true}
            session={session}
            variant="full"
          />

          {/* Render template content if available, otherwise use fallback */}
          {templateHtml ? (
            <div 
              className="template-body text-sm"
              dangerouslySetInnerHTML={{ __html: templateHtml }}
            />
          ) : (
            <>
              {/* Fallback content when no template is available */}
              <DateBlock 
                ourRef={reference}
                date={currentDate} 
              />

              <AddressBlock 
                recipientTitle="The Principal/Head Teacher"
                lines={[
                  school?.name || posting?.school_name || '________________________________________',
                  school?.address || posting?.school_address || '________________________________________',
                  posting?.lga ? `${posting.lga} L.G.A` : '',
                  posting?.state ? `${posting.state} State` : '',
                ].filter(Boolean)}
                salutation="Dear Sir/Madam,"
              />

              <h2 
                className="text-center font-bold text-base mb-4 uppercase tracking-wide"
                style={{ 
                  color: institution?.primary_color || '#0c5b32',
                  textDecoration: 'underline',
                }}
              >
                RE: POSTING OF STUDENT FOR TEACHING PRACTICE
              </h2>

              <p className="mb-4 text-sm indent-8">
                I am pleased to formally introduce <strong>{student?.full_name?.toUpperCase() || '________________________'}</strong>, 
                a student-teacher from {institution?.name || 'our institution'}, who has been assigned to undertake 
                the mandatory Teaching Practice exercise at your esteemed school.
              </p>

              {/* Student Information Table */}
              <StudentInfoTable 
                student={student} 
                session={session}
                posting={posting}
                institution={institution}
                variant="striped"
              />

              <p className="mb-4 text-sm indent-8 mt-6">
                The exercise shall span a period of <strong>{session?.tp_duration_weeks ? `${session.tp_duration_weeks} weeks` : 'twelve (12) weeks'}</strong>, 
                commencing on <strong>{formatDateLong(session?.start_date)}</strong> and concluding 
                on <strong>{formatDateLong(session?.end_date)}</strong>. In accordance with the revised curriculum, 
                the assessment of the student-teacher will be conducted jointly by the {institution?.institution_type === 'university' ? 'University' : 'College'} and your school.
              </p>

              <p className="mb-4 text-sm indent-8">
                The assessment forms have been provided for your use. We kindly request that evaluations be 
                completed every three (3) weeks and submitted to our visiting supervisors for institutional 
                assessment. All assessments shall be treated with strict confidentiality.
              </p>

              <p className="mb-4 text-sm indent-8">
                We recommend that the student-teacher be actively engaged in both academic and extracurricular 
                activities, including but not limited to classroom instruction, pastoral duties, and ancillary 
                school functions. This comprehensive exposure is designed to enhance their professional development.
              </p>

              <p className="mb-4 text-sm indent-8">
                We deeply value and appreciate your continued partnership in our collective mission 
                to nurture competent educators for the academic community.
              </p>

              <p className="mb-6 text-sm">Thank you for your cooperation.</p>

              <SignatureBlock 
                name={coordinator?.name || '____________________'}
                title="Teaching Practice Coordinator"
                phone={coordinator?.phone}
                email={coordinator?.email}
                signatureUrl={coordinator?.signature_url}
                showDate={true}
                date={currentDate}
              />
            </>
          )}

          {/* Document Footer */}
          <DocumentFooter institution={institution} session={session} showCoordinator={true} />
        </DocumentContainer>
      </div>
    </div>
  );
}

export default PostingLetterPage;
