/**
 * Introduction Letter Document
 * Student introduction letter for school placement request
 */

import {
  DocumentPreview,
  DateBlock,
  AddressBlock,
  StudentInfoTable,
  SignatureBlock,
} from './DocumentPreview';

export function IntroductionLetter({
  student,
  session,
  institution,
  coordinator,
  onBack,
  onClose,
}) {
  // Generate reference number
  const reference = `TP/INT/${session?.code || new Date().getFullYear()}/${student?.registration_number?.replace(/\//g, '-') || student?.id || ''}`;

  // Use session coordinator info as fallback
  const effectiveCoordinator = coordinator || {
    name: session?.coordinator_name,
    phone: session?.coordinator_phone,
    email: session?.coordinator_email,
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

  return (
    <DocumentPreview
      title="LETTER OF INTRODUCTION"
      subtitle={`Request for Placement - ${session?.name || ''} Teaching Practice`}
      institution={institution}
      session={session}
      referenceNumber={reference}
      variant="full"
      onBack={onBack}
      onClose={onClose}
    >
      <DateBlock ourRef={reference} />

      <AddressBlock 
        recipientTitle="The Principal/Head Teacher"
        lines={[
          '________________________________________',
          '________________________________________',
        ]}
        salutation="Dear Sir/Madam,"
      />

      <p className="mb-4 text-sm indent-8">
        I am writing to request your kind consideration in offering a place of attachment 
        for the <strong>{session?.name || 'current'}</strong> Student Teaching Practice exercise.
      </p>

      {/* Student Information */}
      <StudentInfoTable 
        student={student} 
        session={session}
        institution={institution}
        variant="bordered"
      />

      <p className="mb-4 text-sm indent-8">
        The bearer of this letter is required to undertake a Teaching Practice exercise as 
        part of the requirements set by the National Universities Commission (NUC) and 
        National Commission for Colleges of Education (NCCE) for the award of 
        {institution?.institution_type === 'university' 
          ? " a Bachelor's Degree in Education"
          : " the Nigeria Certificate in Education (NCE)"
        }.
      </p>

      <p className="mb-4 text-sm indent-8">
        We would be grateful if your school could accommodate the student for this critical 
        component of their academic training. 
        {session?.tp_duration_weeks && (
          <> The exercise will last for approximately <strong>{session.tp_duration_weeks} weeks</strong>.</>
        )}
      </p>

      <p className="mb-4 text-sm indent-8">
        We kindly request that you monitor and guide the student to support his/her 
        professional growth and development. We are confident that our student will adhere 
        to all rules and regulations of your school.
      </p>

      <p className="mb-4 text-sm indent-8">
        However, any instances of misconduct on the part of the student should be reported 
        to the {getInstitutionLabel()} so that appropriate action can be taken.
      </p>

      <p className="mb-4 text-sm indent-8">
        We therefore request you to please confirm his/her acceptance by signing on the 
        attached acceptance form.
      </p>

      <p className="mb-6 text-sm">Thank you for your usual cooperation.</p>

      <SignatureBlock 
        name={effectiveCoordinator?.name || '____________________'}
        title="Teaching Practice Coordinator"
        phone={effectiveCoordinator?.phone}
        email={effectiveCoordinator?.email}
        signatureUrl={effectiveCoordinator?.signature_url}
      />

      {/* Note for student */}
      <div className="mt-8 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
        <p className="font-semibold text-blue-800 mb-1">Instructions to Student:</p>
        <ul className="list-disc list-inside text-blue-700 space-y-1">
          <li>Present this letter along with the Acceptance Form to the school authority.</li>
          <li>Ensure the Acceptance Form is properly signed and stamped.</li>
          <li>Return the signed Acceptance Form to the {institution?.tp_unit_name || 'TP Coordination Unit'}.</li>
          <li>Keep a photocopy of all documents for your records.</li>
        </ul>
      </div>
    </DocumentPreview>
  );
}

export default IntroductionLetter;
