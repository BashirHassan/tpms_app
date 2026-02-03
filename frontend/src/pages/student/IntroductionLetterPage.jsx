/**
 * Introduction Letter Page (Student)
 * View and print introduction letter for school placement request
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
  DateBlock,
  AddressBlock,
  StudentInfoTable,
  SignatureBlock,
} from '../../components/documents/DocumentPreview';
import {
  IconFileText,
  IconPrinter,
  IconRefresh,
  IconAlertCircle,
} from '@tabler/icons-react';

function IntroductionLetterPage() {
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
      const response = await portalApi.renderDocument('introduction_letter');
      const data = response.data.data || response.data || {};
      
      setDocumentData(data);
      setTemplateHtml(data.html); // May be null if no template exists
    } catch (err) {
      console.error('Failed to load introduction letter:', err);
      if (err.response?.status === 404) {
        setError('not_found');
      } else if (err.response?.status === 403) {
        setError('not_available');
      } else {
        setError('error');
        toast.error('Failed to load introduction letter');
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
    return `TP/INT/${session?.code || new Date().getFullYear()}/${student?.registration_number?.replace(/\//g, '-') || student?.id || ''}`;
  };

  // Get institution type label
  const getInstitutionLabel = () => {
    const types = {
      'university': 'University',
      'college_of_education': 'College',
      'polytechnic': 'Polytechnic',
    };
    return types[institution?.institution_type] || 'Institution';
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px] sm:min-h-[400px] px-4">
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-primary-200 border-t-primary-600"></div>
          <p className="text-gray-500 text-sm sm:text-base">Loading introduction letter...</p>
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
              <IconFileText className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Introduction Letter Not Available</h2>
            <p className="text-gray-600 mb-4 sm:mb-6 text-sm sm:text-base">
              Your introduction letter is not available at this time. 
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
              There was an error loading your introduction letter. Please try again.
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
  const reference = getReference();

  return (
    <div className="space-y-3 sm:space-y-4 px-1">
      {/* Action Buttons - Hidden on Print */}
      <div className="flex items-center justify-between gap-2 max-w-[210mm] mx-auto print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Introduction Letter</h1>
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
          {templateHtml && (
            <div 
              className="template-body text-sm"
              dangerouslySetInnerHTML={{ __html: templateHtml }}
            />
          )}

          {/* Document Footer */}
          <DocumentFooter institution={institution} session={session} showCoordinator={true} />
        </DocumentContainer>
      </div>
    </div>
  );
}

export default IntroductionLetterPage;
