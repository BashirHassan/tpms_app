/**
 * Acceptance Document Page (Student)
 * View and print acceptance form document for school principal to sign
 * 
 * Uses the template system for body content while keeping React-based header/footer
 */

import { useState, useEffect } from 'react';
import { portalApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  DocumentLetterhead,
  DocumentContainer,
  DocumentFooter,
  DocumentPrintStyles,
  TemplateBodyStyles,
  BlankLine,
  StudentInfoTable,
} from '../../components/documents/DocumentPreview';
import {
  IconPrinter,
  IconRefresh,
  IconAlertCircle,
  IconClipboardCheck,
} from '@tabler/icons-react';

function AcceptanceDocumentPage() {
  const { institution } = useAuth();
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
      // Try to get template-rendered document
      const response = await portalApi.renderDocument('acceptance_form');
      const data = response.data.data || response.data || {};
      
      setDocumentData(data);
      setTemplateHtml(data.html); // May be null if no template exists
    } catch (err) {
      console.error('Failed to load acceptance form:', err);
      if (err.response?.status === 404) {
        setError('not_found');
      } else if (err.response?.status === 403) {
        setError('not_available');
      } else {
        setError('error');
        toast.error('Failed to load acceptance form');
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
    return `TP/ACC/${session?.code || new Date().getFullYear()}/${student?.registration_number?.replace(/\//g, '-') || ''}`;
  };

  const currentDate = new Date().toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Default programs list
  const defaultPrograms = [
    'Biology Education',
    'Chemistry Education',
    'Christian Studies Education',
    'Computer Science Education',
    'Economics Education',
    'English Education',
    'Geography Education',
    'History Education',
    'Islamic Studies Education',
    'Mathematics Education',
    'Physics Education',
    'Political Science Education',
    'Guidance and Counselling',
    'Admin and Planning',
    'Integrated Science Education',
    'Agricultural Science Education',
    'Arabic Education',
  ];

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px] px-4">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-primary-200 border-t-primary-600"></div>
          <p className="text-gray-500 text-sm sm:text-base">Loading acceptance form...</p>
        </div>
      </div>
    );
  }

  // Error: Not found
  if (error === 'not_found') {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconClipboardCheck className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Acceptance Form Not Available</h2>
            <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
              Your acceptance form is not available at this time. 
              Please ensure you have an active session and valid student registration.
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

  // Error: Not available (forbidden)
  if (error === 'not_available') {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <Card>
          <CardContent className="p-6 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <IconAlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Access Restricted</h2>
            <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
              You do not have permission to access this document at this time.
              Please complete any required prerequisites or contact the TP office.
            </p>
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
              There was an error loading your acceptance form. Please try again.
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
  const programs = documentData?.programs || defaultPrograms;
  const reference = getReference();

  return (
    <div className="space-y-3 sm:space-y-4 px-1">
      {/* Action Buttons - Hidden on Print */}
      <div className="flex items-center justify-between gap-2 max-w-[210mm] mx-auto print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Acceptance Form</h1>
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
              {/* Document Title */}
              <h2 
                className="text-center font-bold text-lg mb-0 uppercase tracking-wide"
                style={{ 
                  color: institution?.primary_color || '#0c5b32',
                  paddingBottom: '0.5rem',
                  display: 'inline-block',
                  width: '100%',
                }}
              >
                STUDENT TEACHING PRACTICE ACCEPTANCE FORM
              </h2>

              <div className="text-right mb-4 text-sm">
                <p><strong>Date:</strong> {currentDate}</p>
                <p><strong>Ref:</strong> {reference}</p>
              </div>

              <p className="mb-4 text-sm">Dear Sir/Madam,</p>

              <p className="mb-4 text-sm indent-8">
                We kindly request you to confirm the acceptance of the student below for the 
                {session?.name ? ` ${session.name}` : ''} Teaching Practice exercise at your school.
              </p>

              {/* Student Info with better styling */}
              <StudentInfoTable 
                student={student} 
                session={session}
                institution={institution}
                variant="bordered"
              />

              <div className="space-y-4 mb-6 text-sm mt-6">
                <p>
                  <strong>School Name:</strong> <BlankLine width="65%" />
                </p>
                <p>
                  <strong>School Address:</strong> <BlankLine width="60%" />
                </p>
                <p>
                  <BlankLine width="100%" />
                </p>
                <p>
                  <strong>L.G.A:</strong> <BlankLine width="40%" /> <strong>State:</strong> <BlankLine width="30%" />
                </p>
              </div>

              <div className="mt-6 mb-4">
                <p className="font-semibold text-sm mb-2">Student's Teaching Subject(s):</p>
                <div className="grid grid-cols-2 md:grid-cols-3 print:grid-cols-3 gap-1 text-xs border border-gray-300 p-3 rounded">
                  {programs.map((program, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <span className="inline-block w-4 h-4 text-center border border-gray-400 text-[10px] leading-4">
                        {student?.program_name === program ? '✓' : ''}
                      </span>
                      <span className="truncate">{program}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mt-10 text-sm">
                <div>
                  <div className="border-b border-gray-800 w-full mb-2 h-12" />
                  <p className="font-semibold">Name of Principal/Head Teacher</p>
                </div>
                <div>
                  <div className="border-b border-gray-800 w-full mb-2 h-12" />
                  <p className="font-semibold">Signature & Official Stamp</p>
                  <div className="mt-4">
                    <p>Date: <BlankLine width="60%" /></p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-3 bg-gray-50 border border-gray-200 rounded text-xs print:bg-gray-50">
                <p className="font-semibold mb-1">Note:</p>
                <p>Please ensure this form is properly signed and stamped before returning to the student.</p>
              </div>
            </>
          )}

          {/* Document Footer */}
          <DocumentFooter institution={institution} session={session} />
        </DocumentContainer>
      </div>
    </div>
  );
}

export default AcceptanceDocumentPage;
