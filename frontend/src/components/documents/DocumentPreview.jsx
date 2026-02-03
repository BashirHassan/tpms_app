/**
 * Document Preview Component
 * Reusable component for previewing and printing institutional documents
 * 
 * Features:
 * - Professional institution letterhead with logo and coat of arms
 * - Institution branding with primary/secondary colors
 * - Contact information (email, phone, address, state)
 * - Watermark support
 * - Print-optimized styling (A4 format)
 * - Download/Print actions
 * - Session coordinator information
 */

import { forwardRef, useRef, useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { sessionsApi } from '../../api/sessions';
import { portalApi } from '../../api/portal';
import { Button } from '../ui/Button';
import { 
  IconPrinter, 
  IconDownload, 
  IconX,
  IconArrowLeft,
  IconMail,
  IconPhone,
  IconMapPin,
  IconWorld,
  IconUser,
} from '@tabler/icons-react';
import { cn } from '../../utils/helpers';

/**
 * DocumentPrintStyles - Shared print styles for all document pages
 * Use this component to ensure consistent print styling across all document-related pages
 * 
 * @param {string} containerClass - The CSS class of the printable container (default: 'print-document')
 * @param {boolean} avoidBreakInside - Array of additional CSS classes to apply page-break-inside: avoid
 */
export function DocumentPrintStyles({ 
  containerClass = 'print-document',
  avoidBreakClasses = [],
}) {
  const defaultAvoidBreakClasses = [
    '.posting-card',
    '.school-group-card', 
    '.merged-group',
    '.student-info-table',
  ];
  
  const allAvoidBreakClasses = [...defaultAvoidBreakClasses, ...avoidBreakClasses];
  const avoidBreakSelectors = allAvoidBreakClasses.join(',\n            ');
  
  return (
    <style>{`
      @media print {
        body * {
          visibility: hidden;
        }
        .${containerClass},
        .${containerClass} * {
          visibility: visible;
        }
        .${containerClass} {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        .print-hidden {
          display: none !important;
        }
        ${avoidBreakSelectors} {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .supervisor-section {
          page-break-before: always;
        }
        .supervisor-section:first-child {
          page-break-before: avoid;
        }
        @page {
          margin: 0.5in;
          size: A4 portrait;
        }
        @page :first {
          margin-top: 0.3in;
        }
        .document-container {
          box-shadow: none !important;
          border-radius: 0 !important;
          max-width: none !important;
          min-height: auto !important;
        }
        .document-letterhead img {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .document-watermark {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `}</style>
  );
}

/**
 * TemplateBodyStyles - Styles for rendering template content from Quill editor
 * Includes alignment, font size, line height, and other formatting styles
 * Use this component wherever template HTML content is rendered with dangerouslySetInnerHTML
 */
export function TemplateBodyStyles() {
  return (
    <style>{`
      /* Quill Editor Alignment Styles */
      .template-body .ql-align-center,
      .template-body [style*="text-align: center"] {
        text-align: center !important;
      }
      .template-body .ql-align-right,
      .template-body [style*="text-align: right"] {
        text-align: right !important;
      }
      .template-body .ql-align-justify,
      .template-body [style*="text-align: justify"] {
        text-align: justify !important;
      }
      .template-body .ql-align-left,
      .template-body [style*="text-align: left"] {
        text-align: left !important;
      }
      
      /* Font Family */
      .template-body {
        font-family: 'Times New Roman', Times, serif;
      }
      
      /* Paragraph spacing */
      .template-body p {
        margin-bottom: 0.75em;
      }
      
      /* Preserve empty paragraphs (empty lines/spacing from editor) */
      .template-body p:empty,
      .template-body p:has(> br:only-child) {
        min-height: 1em;
      }
      
      /* Fallback for browsers without :has() support */
      .template-body p br:only-child {
        display: block;
        content: "";
        min-height: 1em;
      }
      
      /* Indent styles */
      .template-body .ql-indent-1 { padding-left: 3em; }
      .template-body .ql-indent-2 { padding-left: 6em; }
      .template-body .ql-indent-3 { padding-left: 9em; }
      .template-body .ql-indent-4 { padding-left: 12em; }
      .template-body .ql-indent-5 { padding-left: 15em; }
      .template-body .ql-indent-6 { padding-left: 18em; }
      .template-body .ql-indent-7 { padding-left: 21em; }
      .template-body .ql-indent-8 { padding-left: 24em; }
      
      /* List styles */
      .template-body ol,
      .template-body ul {
        padding-left: 1.5em;
        margin-bottom: 0.75em;
      }
      .template-body li {
        margin-bottom: 0.25em;
      }
      
      /* Table styles */
      .template-body table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 1em;
      }
      .template-body td,
      .template-body th {
        border: 1px solid #ccc;
        padding: 8px;
      }
      
      /* Header styles */
      .template-body h1 { font-size: 2em; font-weight: bold; margin-bottom: 0.5em; }
      .template-body h2 { font-size: 1.5em; font-weight: bold; margin-bottom: 0.5em; }
      .template-body h3 { font-size: 1.17em; font-weight: bold; margin-bottom: 0.5em; }
      .template-body h4 { font-size: 1em; font-weight: bold; margin-bottom: 0.5em; }
      
      /* Ensure print styles are preserved */
      @media print {
        .template-body .ql-align-center,
        .template-body [style*="text-align: center"] {
          text-align: center !important;
        }
        .template-body .ql-align-right,
        .template-body [style*="text-align: right"] {
          text-align: right !important;
        }
        .template-body .ql-align-justify,
        .template-body [style*="text-align: justify"] {
          text-align: justify !important;
        }
        /* Preserve empty paragraphs in print */
        .template-body p:empty,
        .template-body p:has(> br:only-child) {
          min-height: 1em !important;
        }
      }
    `}</style>
  );
}

/**
 * Document Letterhead - Professional institution header with branding
 * Displays: Logo (left), Institution Name, Type, Address, State, Contact Info (centered)
 */
export function DocumentLetterhead({ 
  institution, 
  subtitle,
  unit, // Will default to institution.tp_unit_name or 'Teaching Practice Coordination Unit'
  showContacts = true,
  showMotto = false,
  motto,
  session,
  variant = 'full', // 'full', 'compact', 'minimal'
}) {
  const primaryColor = institution?.primary_color || '#0c5b32';
  const secondaryColor = institution?.secondary_color || '#8b4513';
  // Use provided unit, or institution's tp_unit_name, or default fallback
  const effectiveUnit =  institution?.tp_unit_name || unit || 'Teaching Practice Coordination Unit';
  console.log(institution)
  return (
    <div className="document-letterhead mb-1">
      {/* Main Header Section - Logo Left, Info Centered */}
      <div className="flex items-center gap-x-4">
        {/* Logo Section - Left aligned, smaller */}
        {institution?.logo_url && (
          <div className="flex-shrink-0">
            <img 
              src={institution.logo_url} 
              alt={`${institution.name} Logo`}
              className="h-[4.5rem] w-[4.5rem] md:h-[5.5rem] md:w-[5.5rem] object-contain"
            />
          </div>
        )}
        
        {/* Institution Info - Centered */}
        <div className="flex-1 text-center">
          {/* Institution Name */}
          <h1 
            className="text-2xl font-bold uppercase tracking-wide leading-tight"
            style={{ color: primaryColor }}
          >
            {institution?.name || 'Institution Name'}
          </h1>
          
          {/* Address */}
          {institution?.address && variant !== 'minimal' && (
            <p className="text-xs text-gray-700 leading-tight">
              {institution.address}
              {institution?.state && `, ${institution.state} State`}
            </p>
          )}
          
          {/* Contact Information Row */}
          {showContacts && variant !== 'minimal' && (institution?.email || institution?.phone) && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 text-sm text-gray-600">
              {institution?.email && (
                <span className="flex items-center gap-0.5">
                  <IconMail className="w-4 h-4" />
                  {institution.email}
                </span>
              )}
              {institution?.phone && (
                <span className="flex items-center gap-0.5">
                  <IconPhone className="w-4 h-4" />
                  {institution.phone}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Empty space for balance when logo exists */}
        {institution?.logo_url && <div className="w-14 md:w-16 flex-shrink-0" />}
      </div>

      {/* Motto (if provided) */}
      {showMotto && motto && (
        <p 
          className="text-xs italic text-center mt-1 font-medium"
          style={{ color: secondaryColor }}
        >
          "{motto}"
        </p>
      )}
      
      {/* Unit/Department Section */}
      {(subtitle || effectiveUnit) && (
        <div className="text-center">
          {subtitle && (
            <h2 
              className="text-sm font-bold uppercase tracking-wide"
              style={{ color: primaryColor }}
            >
              {subtitle}
            </h2>
          )}
          {effectiveUnit && (
            <p 
              className="text-xs font-semibold mt-[-0.5rem]"
              style={{ color: secondaryColor }}
            >
              {effectiveUnit}
            </p>
          )}
        </div>
      )}

      {/* Session Information (if provided) - More compact */}
      {session && variant === 'full' && (
        <div className="text-center text-xs text-gray-600">
          <span className="font-bold">{session.name || session.code} SESSION</span>
        </div>
      )}
      
      {/* Bottom Border Line */}
      <div 
        className="border-b-[2.5px]"
        style={{ borderColor: primaryColor }}
      />
    </div>
  );
}

/**
 * Document Watermark - Background watermark with institution logo
 * Creates a subtle, centered watermark for official documents
 * Uses fixed positioning for print to appear on all pages
 */
export function DocumentWatermark({ institution, opacity = 0.08 }) {
  if (!institution?.logo_url) return null;
  
  return (
    <>
      {/* Screen watermark - absolute within container */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden print:hidden"
        style={{ zIndex: 0 }}
      >
        <img 
          src={institution.logo_url} 
          alt=""
          className="w-[50%] max-w-[350px] object-contain"
          style={{ 
            opacity,
            filter: 'grayscale(50%)',
          }}
        />
      </div>
      
      {/* Print watermark - fixed to appear on all pages, centered */}
      <style>{`
        @media print {
          .print-watermark {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 50% !important;
            max-width: 350px !important;
            height: auto !important;
            opacity: ${opacity} !important;
            filter: grayscale(50%) !important;
            z-index: 0 !important;
            pointer-events: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      <img 
        src={institution.logo_url} 
        alt=""
        className="hidden print:block print-watermark"
      />
    </>
  );
}

/**
 * Document Footer - Compact footer with institution info, coordinator details, and generation info
 * Automatically fetches current session for consistent data across all documents
 * Can accept session prop directly to avoid duplicate API calls
 */
export function DocumentFooter({ 
  institution, 
  session: sessionProp,
  showNote = true, 
  showPageNumber = false,
  referenceNumber,
  showCoordinator = true,
}) {
  const [currentSession, setCurrentSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const { user } = useAuth();

  // Fetch current session if not provided as prop
  useEffect(() => {
    // If session is provided as prop, use it directly
    if (sessionProp) {
      setCurrentSession(sessionProp);
      return;
    }
    
    const fetchCurrentSession = async () => {
      try {
        setLoadingSession(true);
        
        // Try portal API first (works for students)
        if (user?.role === 'student') {
          try {
            const response = await portalApi.getWindowsStatus();
            if (response.data?.session) {
              setCurrentSession(response.data.session);
              return;
            }
          } catch (err) {
            // Portal API failed, try sessions API as fallback
            console.debug('Portal API failed, trying sessions API');
          }
        }
        
        // Fallback to sessions API (works for admins/supervisors)
        const response = await sessionsApi.getCurrent();
        setCurrentSession(response.data.data || response.data || null);
      } catch (err) {
        // No current session - that's fine
        console.debug('No current session available for document footer');
      } finally {
        setLoadingSession(false);
      }
    };

    fetchCurrentSession();
  }, [user?.role, sessionProp]);

  const currentDate = new Date().toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  if (!showNote) return null;
  
  const primaryColor = institution?.primary_color || '#0c5b32';
  const hasCoordinatorInfo = currentSession?.coordinator_name || currentSession?.coordinator_phone || currentSession?.coordinator_email;

  return (
    <div className="document-footer mt-6 print:mt-4">
      {/* Top border */}
      <div 
        className="mb-1 border-t-[2.5px] border-gray-300"
      />
      
      <div className="text-center text-[12px] text-gray-500 space-y-0.5">
        {/* Coordinator/Supervisor Info */}
        {showCoordinator && hasCoordinatorInfo && (
          <p className="flex items-center justify-center gap-2 text-gray-600">
            <IconUser className="w-4 h-4 inline-block" />
            <span className="font-semibold">TP Office:</span>
            <span className="font-medium">{currentSession.coordinator_name}</span>
            {currentSession.coordinator_phone && (
              <>
                <span>•</span>
                <IconPhone className="w-4 h-4 inline-block" />
                <span>{currentSession.coordinator_phone}</span>
              </>
            )}
            {currentSession.coordinator_email && (
              <>
                <span>•</span>
                <IconMail className="w-4 h-4 inline-block" />
                <span>{currentSession.coordinator_email}</span>
              </>
            )}
          </p>
        )}
        
        {/* Generation Info */}
        <p className="text-gray-500 italic">
          Generated on {currentDate} via DigitalTP
          {referenceNumber && ` | Ref: ${referenceNumber}`}
          {currentSession?.name && ` | Session: ${currentSession.name}`}
        </p>
      </div>
    </div>
  );
}

/**
 * Document Actions - Print/Download buttons
 */
export function DocumentActions({ 
  onPrint, 
  onDownload, 
  onClose,
  onBack,
  showDownload = true,
  downloadLabel = 'Download PDF',
  className,
}) {
  return (
    <div className={cn(
      'flex flex-col sm:flex-row gap-2 justify-center items-center py-4 print:hidden',
      className
    )}>
      {onBack && (
        <Button variant="outline" onClick={onBack}>
          <IconArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      )}
      {onClose && (
        <Button variant="outline" onClick={onClose}>
          <IconX className="w-4 h-4 mr-2" />
          Close
        </Button>
      )}
      {onPrint && (
        <Button variant="primary" onClick={onPrint}>
          <IconPrinter className="w-4 h-4 mr-2" />
          Print
        </Button>
      )}
      {showDownload && onDownload && (
        <Button variant="secondary" onClick={onDownload}>
          <IconDownload className="w-4 h-4 mr-2" />
          {downloadLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Document Container - Main document wrapper with styling
 */
export const DocumentContainer = forwardRef(function DocumentContainer(
  { 
    children, 
    className,
    showWatermark = true,
    institution,
    ...props 
  }, 
  ref
) {
  const { institution: authInstitution } = useAuth();
  const inst = institution || authInstitution;

  return (
    <div 
      ref={ref}
      className={cn(
        'document-container relative bg-white shadow-lg rounded-lg mx-auto',
        'max-w-[210mm] min-h-[297mm] p-8 md:p-12',
        'print:shadow-none print:rounded-none print:max-w-none print:p-[0.7in]',
        className
      )}
      style={{ fontFamily: "'Times New Roman', Times, serif" }}
      {...props}
    >
      {showWatermark && <DocumentWatermark institution={inst} />}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
});

/**
 * DocumentPreview - Full document preview with header, content, and actions
 */
export function DocumentPreview({
  title,
  subtitle,
  unit,
  children,
  institution,
  session,
  showLetterhead = true,
  showFooter = true,
  showWatermark = true,
  showContacts = true,
  showMotto = false,
  motto,
  variant = 'full', // 'full', 'compact', 'minimal'
  referenceNumber,
  onBack,
  onClose,
  onDownload,
  showDownload = false,
  downloadLabel,
  className,
  contentClassName,
}) {
  const { institution: authInstitution } = useAuth();
  const inst = institution || authInstitution;
  const documentRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  const primaryColor = inst?.primary_color || '#0c5b32';

  return (
    <div className={cn('document-preview', className)}>
      {/* Shared Print Styles */}
      <DocumentPrintStyles containerClass="document-preview" />

      <DocumentContainer 
        ref={documentRef}
        institution={inst}
        showWatermark={showWatermark}
        className={contentClassName}
      >
        {showLetterhead && (
          <DocumentLetterhead 
            institution={inst}
            subtitle={subtitle}
            unit={unit}
            showContacts={showContacts}
            showMotto={showMotto}
            motto={motto}
            session={session}
            variant={variant}
          />
        )}
        
        {title && (
          <h2 
            className="text-center font-bold text-lg mb-6 uppercase tracking-wide"
            style={{ 
              color: primaryColor,
              borderBottom: `2px solid ${primaryColor}`,
              paddingBottom: '0.5rem',
              display: 'inline-block',
              width: '100%',
            }}
          >
            {title}
          </h2>
        )}
        
        <div className="document-content text-justify leading-relaxed text-base">
          {children}
        </div>

        {showFooter && (
          <DocumentFooter 
            institution={inst} 
            referenceNumber={referenceNumber}
            session={session}
          />
        )}
      </DocumentContainer>

      <DocumentActions 
        onPrint={handlePrint}
        onDownload={onDownload}
        onBack={onBack}
        onClose={onClose}
        showDownload={showDownload}
        downloadLabel={downloadLabel}
      />
    </div>
  );
}

/**
 * SignatureBlock - Professional signature area with line and optional stamp
 */
export function SignatureBlock({ 
  name, 
  title, 
  phone,
  email,
  signatureUrl,
  stampUrl,
  date,
  showDate = false,
  className,
  align = 'left', // 'left', 'right', 'center'
}) {
  const alignmentClasses = {
    left: 'text-left',
    right: 'text-right ml-auto',
    center: 'text-center mx-auto',
  };
  
  return (
    <div className={cn('signature-block mt-10', alignmentClasses[align], className)}>
      {/* Signature Image or Line */}
      <div className="relative inline-block">
        {signatureUrl ? (
          <img 
            src={signatureUrl} 
            alt={`${name} Signature`}
            className="h-16 mb-1 object-contain"
          />
        ) : (
          <div className="w-52 border-b-2 border-gray-800 mb-2 mt-8" />
        )}
        {/* Official Stamp (if provided) */}
        {stampUrl && (
          <img 
            src={stampUrl} 
            alt="Official Stamp"
            className="absolute -right-12 -top-4 h-20 w-20 object-contain opacity-80"
          />
        )}
      </div>
      
      {/* Name */}
      <p className="text-base font-bold uppercase">{name}</p>
      
      {/* Title/Position */}
      {title && (
        <p className="text-sm font-semibold text-gray-700 italic">{title}</p>
      )}
      
      {/* Contact Info */}
      {(phone || email) && (
        <p className="text-xs text-gray-500 mt-1">
          {phone && `Tel: ${phone}`}
          {phone && email && ' | '}
          {email && `Email: ${email}`}
        </p>
      )}
      
      {/* Date */}
      {showDate && (
        <p className="text-sm mt-2">
          <span className="font-semibold">Date:</span> {' '}
          {date || new Date().toLocaleDateString('en-NG', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}
        </p>
      )}
    </div>
  );
}

/**
 * DualSignatureBlock - Two signatures side by side
 */
export function DualSignatureBlock({
  leftSignature,
  rightSignature,
  className,
}) {
  return (
    <div className={cn('flex justify-between items-end mt-10 gap-8', className)}>
      {leftSignature && (
        <SignatureBlock {...leftSignature} align="left" className="mt-0" />
      )}
      {rightSignature && (
        <SignatureBlock {...rightSignature} align="right" className="mt-0" />
      )}
    </div>
  );
}

/**
 * BlankLine - Blank line for filling in with optional label
 */
export function BlankLine({ width = '100%', label, className }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      {label && <span className="text-sm font-medium">{label}:</span>}
      <span 
        className="inline-block border-b border-gray-600 border-dotted"
        style={{ width, minWidth: '80px' }}
      >
        &nbsp;
      </span>
    </span>
  );
}

/**
 * DateBlock - Reference and date block (professional formatting)
 */
export function DateBlock({ reference, date, ourRef, yourRef, className }) {
  const formattedDate = date instanceof Date 
    ? date.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
    : date || new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className={cn('mb-6 text-sm', className)}>
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          {ourRef && (
            <p><span className="font-semibold">Our Ref:</span> {ourRef}</p>
          )}
          {yourRef && (
            <p><span className="font-semibold">Your Ref:</span> {yourRef}</p>
          )}
          {reference && !ourRef && (
            <p><span className="font-semibold">Ref:</span> {reference}</p>
          )}
        </div>
        <div className="text-right">
          <p><span className="font-semibold">Date:</span> {formattedDate}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * AddressBlock - Recipient address (formal letter format)
 */
export function AddressBlock({ 
  lines, 
  salutation,
  recipientTitle,
  className 
}) {
  return (
    <div className={cn('address-block mb-6 text-base', className)}>
      {recipientTitle && (
        <p className="font-semibold mb-1">{recipientTitle}</p>
      )}
      {lines.map((line, index) => (
        <p key={index} className="leading-snug">{line}</p>
      ))}
      {salutation && (
        <p className="mt-4 font-medium">{salutation}</p>
      )}
    </div>
  );
}

/**
 * StudentInfoTable - Professional table displaying student details
 */
export function StudentInfoTable({ 
  student, 
  session, 
  posting,
  showPhoto = false,
  variant = 'bordered', // 'bordered', 'striped', 'minimal'
  className,
  institution,
}) {
  const primaryColor = institution?.primary_color || '#0c5b32';
  
  const rows = [
    { label: 'Full Name', value: student.full_name?.toUpperCase() },
    { label: 'Registration Number', value: student.registration_number },
    { label: 'Matriculation Number', value: student.matric_number },
    { label: 'Faculty', value: student.faculty_name },
    { label: 'Department', value: student.department_name },
    { label: 'Programme', value: student.program_name },
    { label: 'Level', value: student.level ? `${student.level} Level` : null },
    { label: 'Academic Session', value: session?.name || session?.code },
    { label: 'TP Duration', value: session?.tp_duration_weeks ? `${session.tp_duration_weeks} Weeks` : null },
    ...(posting ? [
      { label: 'Posted School', value: posting.school_name },
      { label: 'School Address', value: posting.school_address },
      { label: 'LGA', value: posting.lga },
    ] : []),
  ].filter(row => row.value);

  const variantStyles = {
    bordered: 'border-2 border-gray-700',
    striped: 'border border-gray-300',
    minimal: '',
  };

  return (
    <div className={cn('my-6', variantStyles[variant], className)}>
      {/* Header */}
      <div 
        className="px-4 py-2 text-center font-bold text-white text-sm uppercase tracking-wide"
        style={{ backgroundColor: primaryColor }}
      >
        Student Information
      </div>
      
      <div className="flex">
        {/* Photo Section */}
        {showPhoto && student.passport_url && (
          <div className="w-32 p-3 border-r border-gray-300 flex-shrink-0">
            <img 
              src={student.passport_url} 
              alt={`${student.full_name} Passport`}
              className="w-full h-36 object-cover border border-gray-400"
            />
          </div>
        )}
        
        {/* Info Table */}
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, index) => (
              <tr 
                key={index}
                className={cn(
                  variant === 'striped' && index % 2 === 0 ? 'bg-gray-50' : '',
                  'border-b border-gray-200 last:border-b-0'
                )}
              >
                <td className="py-2 px-4 font-semibold w-44 text-gray-700">
                  {row.label}:
                </td>
                <td className="py-2 px-4 font-bold text-gray-900">
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * OfficialStamp - Placeholder for official stamp/seal
 */
export function OfficialStamp({ 
  text = 'OFFICIAL', 
  date,
  institution,
  className,
}) {
  const primaryColor = institution?.primary_color || '#0c5b32';
  
  return (
    <div 
      className={cn(
        'inline-flex flex-col items-center justify-center',
        'w-24 h-24 rounded-full border-4 border-double',
        'text-center font-bold uppercase text-xs',
        'transform rotate-[-15deg] opacity-70',
        className
      )}
      style={{ 
        borderColor: primaryColor,
        color: primaryColor,
      }}
    >
      <span>{text}</span>
      {date && (
        <span className="text-[8px] mt-1">
          {new Date(date).toLocaleDateString('en-NG', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric' 
          })}
        </span>
      )}
    </div>
  );
}

/**
 * InstructionsList - Numbered or bulleted instructions list
 */
export function InstructionsList({ 
  items, 
  title,
  numbered = true,
  className,
}) {
  const ListTag = numbered ? 'ol' : 'ul';
  
  return (
    <div className={cn('my-4', className)}>
      {title && (
        <p className="font-bold mb-2 underline">{title}</p>
      )}
      <ListTag className={cn(
        'pl-6 space-y-1 text-sm',
        numbered ? 'list-decimal' : 'list-disc'
      )}>
        {items.map((item, index) => (
          <li key={index} className="leading-relaxed">{item}</li>
        ))}
      </ListTag>
    </div>
  );
}

/**
 * AttentionBox - Highlighted attention/notice box
 */
export function AttentionBox({ 
  title = 'Important Notice',
  children,
  variant = 'warning', // 'warning', 'info', 'success'
  className,
}) {
  const variantStyles = {
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-800',
    info: 'bg-blue-50 border-blue-500 text-blue-800',
    success: 'bg-green-50 border-green-500 text-green-800',
  };
  
  return (
    <div className={cn(
      'my-4 p-4 border-l-4 rounded-r',
      variantStyles[variant],
      className
    )}>
      {title && (
        <p className="font-bold text-sm mb-1">{title}</p>
      )}
      <div className="text-sm">{children}</div>
    </div>
  );
}

export default DocumentPreview;
