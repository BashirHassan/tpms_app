/**
 * Posting Letter Document
 * Official posting letter for confirmed student placement
 * 
 * Supports template-based rendering (templateHtml) or fallback content
 */

import {
  DocumentPreview,
  TemplateBodyStyles,
  DateBlock,
  AddressBlock,
  SignatureBlock,
  StudentInfoTable,
} from './DocumentPreview';
import { formatDate } from '../../utils/helpers';

export function PostingLetter({
  student,
  session,
  institution,
  school,
  posting,
  coordinator,
  tpDuration,
  tpStartDate,
  tpEndDate,
  postingDate,
  letterNumber,
  templateHtml, // Rendered template body HTML (if available)
  onBack,
  onClose,
}) {
  // Format date with long month format for documents
  const formatDateLong = (dateStr) => formatDate(dateStr, { month: 'long' }, '_____________________');

  // Use session data as fallback for TP dates and duration
  const effectiveTpDuration = tpDuration || (session?.tp_duration_weeks ? `${session.tp_duration_weeks} weeks` : 'twelve (12) weeks');
  const effectiveStartDate = tpStartDate || session?.start_date;
  const effectiveEndDate = tpEndDate || session?.end_date;
  
  // Generate letter reference
  const referenceNumber = letterNumber || `TP/PL/${session?.code || new Date().getFullYear()}/${student?.registration_number?.replace(/\//g, '-') || student?.id || ''}`;

  // Use session coordinator info as fallback
  const effectiveCoordinator = coordinator || {
    name: session?.coordinator_name,
    phone: session?.coordinator_phone,
    email: session?.coordinator_email,
  };

  // If template HTML is provided, render it with the standard header/footer wrapper
  if (templateHtml) {
    return (
      <DocumentPreview
        title="POSTING LETTER"
        subtitle={`${session?.name || ''} Teaching Practice Exercise`}
        institution={institution}
        session={session}
        referenceNumber={referenceNumber}
        variant="full"
        onBack={onBack}
        onClose={onClose}
      >
        <TemplateBodyStyles />
        <div 
          className="template-body text-sm"
          dangerouslySetInnerHTML={{ __html: templateHtml }}
        />
      </DocumentPreview>
    );
  }

  // Fallback: render hardcoded content
  return (
    <DocumentPreview
      title="POSTING LETTER"
      subtitle={`${session?.name || ''} Teaching Practice Exercise`}
      institution={institution}
      session={session}
      referenceNumber={referenceNumber}
      variant="full"
      onBack={onBack}
      onClose={onClose}
    >
      <DateBlock 
        ourRef={referenceNumber}
        date={formatDateLong(postingDate || new Date())} 
      />

      <AddressBlock 
        recipientTitle="The Principal/Head Teacher"
        lines={[
          school?.name || '________________________________________',
          school?.address || school?.ward || '________________________________________',
          school?.lga ? `${school.lga} L.G.A` : '',
          school?.state ? `${school.state} State` : '',
        ].filter(Boolean)}
        salutation="Dear Sir/Madam,"
      />

      <p className="mb-4 text-sm indent-8">
        I am pleased to formally introduce <strong>{student?.full_name?.toUpperCase() || '________________________'}</strong>, 
        a student-teacher from {institution?.name || 'our institution'}, who has been assigned to undertake 
        the mandatory Teaching Practice exercise at your esteemed school.
      </p>

      {/* Student Information Table */}
      <StudentInfoTable 
        student={student} 
        session={session}
        posting={posting || { school_name: school?.name, school_address: school?.address, lga: school?.lga }}
        institution={institution}
        variant="striped"
      />

      <p className="mb-4 text-sm indent-8">
        The exercise shall span a period of <strong>{effectiveTpDuration}</strong>, 
        commencing on <strong>{formatDateLong(effectiveStartDate)}</strong> and concluding 
        on <strong>{formatDateLong(effectiveEndDate)}</strong>. In accordance with the revised curriculum, 
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
        name={effectiveCoordinator?.name || '____________________'}
        title="Teaching Practice Coordinator"
        phone={effectiveCoordinator?.phone}
        email={effectiveCoordinator?.email}
        signatureUrl={effectiveCoordinator?.signature_url}
        showDate={true}
        date={formatDateLong(postingDate || new Date())}
      />
    </DocumentPreview>
  );
}

export default PostingLetter;
