/**
 * Acceptance Form Document
 * Form for school principal to confirm student acceptance
 */

import {
  DocumentPreview,
  BlankLine,
  StudentInfoTable,
} from './DocumentPreview';

export function AcceptanceFormDocument({
  student,
  session,
  institution,
  programs = [],
  onBack,
  onClose,
}) {
  const currentDate = new Date().toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Default programs if not provided
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

  const programList = programs.length > 0 ? programs : defaultPrograms;

  // Generate reference number
  const referenceNumber = `TP/ACC/${session?.code || new Date().getFullYear()}/${student?.registration_number?.replace(/\//g, '-') || ''}`;

  return (
    <DocumentPreview
      title={`STUDENT TEACHING PRACTICE ACCEPTANCE FORM`}
      subtitle={`${session?.name || ''} Exercise`}
      institution={institution}
      session={session}
      referenceNumber={referenceNumber}
      variant="full"
      onBack={onBack}
      onClose={onClose}
    >
      <div className="text-right mb-4 text-sm">
        <p><strong>Date:</strong> {currentDate}</p>
        <p><strong>Ref:</strong> {referenceNumber}</p>
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
        <p className="font-semibold text-sm mb-2">Student&apos;s Teaching Subject(s):</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-xs border border-gray-300 p-3 rounded">
          {programList.map((program, index) => (
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

      <div className="mt-8 p-3 bg-gray-50 border border-gray-200 rounded text-xs">
        <p className="font-semibold mb-1">Note:</p>
        <p>Please ensure this form is properly signed and stamped before returning to the student.</p>
      </div>
    </DocumentPreview>
  );
}

export default AcceptanceFormDocument;
