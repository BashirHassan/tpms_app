/**
 * TemplatePreview Component
 * Displays rendered document preview with different modes
 * Includes institution letterhead and footer for realistic print preview
 */

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  IconEye as Eye, 
  IconFileText as FileText, 
  IconPrinter as Printer, 
  IconUser as User, 
  IconLoader2 as Loader2,
  IconAlertCircle as AlertCircle,
  IconMaximize as Maximize2,
  IconX as X
} from '@tabler/icons-react';
import { Button } from '../ui';
import { documentTemplatesApi } from '../../api/documentTemplates';
import { useAuth } from '../../context/AuthContext';
import { 
  TemplateBodyStyles, 
  DocumentLetterhead, 
  DocumentFooter, 
  DocumentContainer,
  DocumentPrintStyles 
} from './DocumentPreview';

const TemplatePreview = ({ 
  templateId, 
  documentType,
  studentId = null,
  sessionId = null,
  schoolId = null,
  mode = 'sample', // 'raw', 'sample', 'live'
  showHeader = true,
  showFooter = true,
  showWatermark = true,
  className = '' 
}) => {
  const { effectiveInstitution: authInstitution } = useAuth();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [session, setSession] = useState(null);
  const [institution, setInstitution] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  // Use institution from API response, fallback to auth context
  const effectiveInstitution = institution || authInstitution;

  // Fetch preview
  useEffect(() => {
    const fetchPreview = async () => {
      if (!templateId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        let response;
        if (mode === 'raw' || mode === 'sample') {
          // Pass mode as query param to get raw or sample data
          response = await documentTemplatesApi.preview(templateId, { mode });
        } else if (mode === 'live' && studentId) {
          response = await documentTemplatesApi.renderForStudent(templateId, studentId, {
            session_id: sessionId,
            school_id: schoolId
          });
        } else {
          setError('Invalid preview mode or missing student ID for live preview');
          return;
        }

        // Response structure: { success: true, data: { html, metadata, session, institution, ... } }
        const responseData = response.data.data || response.data;
        setHtml(responseData.html || responseData);
        setMetadata({
          page_size: responseData.page_size,
          page_orientation: responseData.page_orientation,
          ...responseData.metadata
        });
        // Store session and institution data from API response (for header/footer components)
        if (responseData.session) {
          setSession(responseData.session);
        }
        if (responseData.institution) {
          setInstitution(responseData.institution);
        }
      } catch (err) {
        console.error('Preview error:', err);
        setError(err.response?.data?.message || 'Failed to load preview');
      } finally {
        setLoading(false);
      }
    };

    fetchPreview();
  }, [templateId, mode, studentId, sessionId, schoolId]);

  // Print using window.print() - matches exactly what's shown on screen
  // Uses the same DocumentPrintStyles component for consistent rendering
  const handlePrint = () => {
    window.print();
  };

  // Mode label
  const getModeLabel = () => {
    switch (mode) {
      case 'raw': return 'Raw Template';
      case 'sample': return 'Sample Data Preview';
      case 'live': return 'Live Preview';
      default: return 'Preview';
    }
  };

  // Mode icon
  const getModeIcon = () => {
    switch (mode) {
      case 'raw': return FileText;
      case 'sample': return Eye;
      case 'live': return User;
      default: return Eye;
    }
  };

  const ModeIcon = getModeIcon();

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          <span className="ml-2 text-gray-600">Loading preview...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-3" />
            <p className="text-red-600 font-medium">Preview Error</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Fullscreen Modal - Hidden on Print */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <ModeIcon className="h-5 w-5 text-gray-500" />
                <span className="font-medium">{getModeLabel()}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFullscreen(false)}
                className="p-2"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              {/* Shared Print Styles */}
              <DocumentPrintStyles containerClass="print-document" />
              <TemplateBodyStyles />
              
              <DocumentContainer 
                institution={effectiveInstitution}
                showWatermark={showWatermark}
                className="print:p-0 min-h-0"
              >
                {/* Document Header */}
                {showHeader && (
                  <DocumentLetterhead 
                    institution={effectiveInstitution}
                    showContacts={true}
                    session={session}
                    variant="full"
                  />
                )}
                
                {/* Template Content */}
                <div 
                  className="template-body text-sm"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                
                {/* Document Footer */}
                {showFooter && (
                  <DocumentFooter 
                    institution={effectiveInstitution}
                    session={session}
                    showNote={true}
                    showCoordinator={true}
                  />
                )}
              </DocumentContainer>
            </div>
          </div>
        </div>
      )}

      {/* Regular Preview */}
      <div className={`bg-white rounded-lg border  print:border-0 print:rounded-none print:bg-transparent ${className}`}>
        {/* Header - Hidden on Print */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-lg print:hidden">
          <div className="flex items-center gap-2">
            <ModeIcon className="h-5 w-5 text-gray-500" />
            <span className="font-medium text-gray-900">{getModeLabel()}</span>
            {metadata && (
              <span className="text-xs text-gray-500">
                ({metadata.page_size} {metadata.page_orientation})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFullscreen(true)}
              className="p-2 text-gray-600"
              title="Fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={handlePrint}
              className="flex items-center gap-1"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="p-4 bg-gray-100 overflow-auto print-document print:p-0 print:bg-transparent print:overflow-visible print:max-h-none" style={{ maxHeight: '600px' }}>
          {/* Shared Print Styles */}
          <DocumentPrintStyles containerClass="print-document" />
          <TemplateBodyStyles />
          
          {html ? (
            <DocumentContainer 
              institution={effectiveInstitution}
              showWatermark={showWatermark}
              className="print:p-0 min-h-0"
            >
              {/* Document Header */}
              {showHeader && (
                <DocumentLetterhead 
                  institution={effectiveInstitution}
                  showContacts={true}
                  session={session}
                  variant="full"
                />
              )}
              
              {/* Template Content */}
              <div 
                className="template-body text-sm"
                dangerouslySetInnerHTML={{ __html: html }}
              />
              
              {/* Document Footer */}
              {showFooter && (
                <DocumentFooter 
                  institution={effectiveInstitution}
                  session={session}
                  showNote={true}
                  showCoordinator={true}
                />
              )}
            </DocumentContainer>
          ) : (
            <div className="text-center text-gray-500 py-20">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-400" />
              <p>No preview available</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

TemplatePreview.propTypes = {
  templateId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  documentType: PropTypes.string,
  studentId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  sessionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  schoolId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  mode: PropTypes.oneOf(['raw', 'sample', 'live']),
  showHeader: PropTypes.bool,
  showFooter: PropTypes.bool,
  showWatermark: PropTypes.bool,
  className: PropTypes.string
};

export default TemplatePreview;
