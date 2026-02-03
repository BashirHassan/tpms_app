/**
 * Supervisor Invitation Letter Page
 * View and print invitation letter for assigned supervision postings
 * 
 * Uses the template system for body content while keeping React-based header/footer
 * Access is available for any user with postings in the current session
 */

import { useState, useEffect } from 'react';
import { postingsApi } from '../../api';
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
  SignatureBlock,
} from '../../components/documents/DocumentPreview';
import {
  IconPrinter,
  IconRefresh,
  IconAlertCircle,
  IconFileText,
  IconSchool,
  IconUsers,
  IconCalendarEvent,
} from '@tabler/icons-react';

function SupervisorInvitationPage() {
  const { user, institution } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [documentData, setDocumentData] = useState(null);
  const [templateHtml, setTemplateHtml] = useState(null);
  const [error, setError] = useState(null);

  // Fetch document data on mount
  useEffect(() => {
    fetchDocumentData();
  }, []);

  const fetchDocumentData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await postingsApi.getMyInvitationLetter();
      const data = response.data.data || response.data || {};
      
      setDocumentData(data);
      setTemplateHtml(data.html); // May be null if no template exists
    } catch (err) {
      console.error('Failed to load invitation letter:', err);
      if (err.response?.status === 404) {
        setError('not_found');
      } else {
        setError('error');
        toast.error('Failed to load invitation letter');
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
    const supervisor = documentData?.supervisor;
    const session = documentData?.session;
    return `TP/INV/${session?.code || new Date().getFullYear()}/${supervisor?.file_number || supervisor?.id || ''}`;
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
          <p className="text-gray-500 text-sm sm:text-base">Loading invitation letter...</p>
        </div>
      </div>
    );
  }

  // Error: Not found (no postings)
  if (error === 'not_found') {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconFileText className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Invitation Letter Not Available</h2>
            <p className="text-gray-600 mb-3 sm:mb-4 text-sm sm:text-base">
              You have no supervision postings for the current session.
              The invitation letter will be available once you are assigned to supervise students.
            </p>
            <Button onClick={fetchDocumentData} variant="outline" className="active:scale-95">
              <IconRefresh className="w-4 h-4 mr-2" />
              Try Again
            </Button>
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
              There was an error loading your invitation letter. Please try again.
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

  const supervisor = documentData?.supervisor;
  const session = documentData?.session;
  const statistics = documentData?.statistics;
  const coordinator = {
    name: session?.coordinator_name,
    phone: session?.coordinator_phone,
    email: session?.coordinator_email,
  };
  const reference = getReference();

  return (
    <div className="space-y-3 sm:space-y-4 px-1">
      {/* Action Buttons - Hidden on Print */}
      <div className="flex items-center justify-between gap-2 max-w-[210mm] mx-auto print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Supervision Invitation Letter</h1>
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

              <div className="mb-4">
                <p className="font-semibold">{supervisor?.rank_name ? `${supervisor.rank_name} ` : ''}{supervisor?.name?.toUpperCase() || user?.name?.toUpperCase()}</p>
                {supervisor?.department_name && <p>{supervisor.department_name}</p>}
                {supervisor?.faculty_name && <p>{supervisor.faculty_name}</p>}
                <p>{institution?.name}</p>
              </div>

              <p className="mb-4">Dear Sir/Madam,</p>

              <h2 
                className="text-center font-bold text-base mb-4 uppercase tracking-wide"
                style={{ 
                  color: institution?.primary_color || '#0c5b32',
                  textDecoration: 'underline',
                }}
              >
                INVITATION TO SUPERVISE TEACHING PRACTICE EXERCISE
              </h2>

              <p className="mb-4 text-sm indent-8">
                I am pleased to inform you that you have been appointed as a Supervisor for the 
                <strong> {session?.name || ''} Teaching Practice Exercise</strong>. This appointment is 
                in recognition of your expertise and commitment to the professional development of 
                our student-teachers.
              </p>

              {/* Posting Summary */}
              <div className="border border-gray-300 rounded-lg p-4 mb-4 bg-gray-50">
                <h3 className="font-semibold text-sm mb-3">Your Supervision Assignment Summary:</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <IconSchool className="w-4 h-4 text-primary-600" />
                    <span><strong>{statistics?.total_schools || 0}</strong> {statistics?.total_schools === 1 ? 'School' : 'Schools'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconUsers className="w-4 h-4 text-primary-600" />
                    <span><strong>{statistics?.total_students || 0}</strong> {statistics?.total_students === 1 ? 'Student' : 'Students'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconCalendarEvent className="w-4 h-4 text-primary-600" />
                    <span><strong>{statistics?.total_visits || session?.max_supervision_visits || 0}</strong> Supervision {statistics?.total_visits === 1 ? 'Visit' : 'Visits'}</span>
                  </div>
                </div>
              </div>

              <p className="mb-4 text-sm indent-8">
                The Teaching Practice exercise is scheduled to commence on 
                <strong> {formatDateLong(session?.tp_start_date)}</strong> and conclude on 
                <strong> {formatDateLong(session?.tp_end_date)}</strong>, spanning a total duration of 
                <strong> {session?.tp_duration_weeks ? `${session.tp_duration_weeks} weeks` : 'the designated period'}</strong>.
              </p>

              <p className="mb-4 text-sm indent-8">
                As a supervisor, you are expected to conduct <strong>{session?.max_supervision_visits || 3} supervision visits</strong> to 
                assess and guide the student-teachers under your care. During each visit, please:
              </p>

              <ul className="list-disc list-inside mb-4 text-sm ml-4 space-y-1">
                <li>Observe the student-teacher's lesson delivery and classroom management</li>
                <li>Provide constructive feedback and guidance for improvement</li>
                <li>Complete the official assessment forms for each student</li>
                <li>Submit your assessment reports to the Teaching Practice office</li>
              </ul>

              <p className="mb-4 text-sm indent-8">
                Detailed information about your assigned schools and students can be accessed from 
                your supervision schedule on the Teaching Practice portal. Please ensure to carry 
                this invitation letter during your visits as proof of your appointment.
              </p>

              <p className="mb-4 text-sm indent-8">
                We trust in your dedication and professionalism to ensure a successful Teaching Practice 
                exercise. Should you require any clarification or support, please do not hesitate to 
                contact the Teaching Practice Coordination Unit.
              </p>

              <p className="mb-6 text-sm">Thank you for your service.</p>

              <SignatureBlock 
                name={coordinator?.name || '____________________'}
                title={'Head, Teaching Practice Unit'}
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

export default SupervisorInvitationPage;
