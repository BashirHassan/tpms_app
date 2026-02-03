/**
 * Document Service
 * Generates printable documents for students (Introduction Letter, Acceptance Form)
 */

class DocumentService {
  /**
   * Generate Introduction Letter HTML
   * @param {Object} student - Student record
   * @param {Object} session - Academic session
   * @param {Object} institution - Institution details
   * @returns {string} HTML document
   */
  static async generateIntroductionLetter(student, session, institution) {
    const currentDate = new Date().toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Introduction Letter - ${student.full_name}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px double #333;
      padding-bottom: 20px;
    }
    .header img {
      max-height: 80px;
      margin-bottom: 10px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .header h2 {
      font-size: 14px;
      font-weight: normal;
      text-transform: uppercase;
    }
    .header p {
      font-size: 12px;
      margin-top: 5px;
    }
    .ref-date {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .address {
      margin-bottom: 20px;
    }
    .salutation {
      margin-bottom: 15px;
    }
    .subject {
      font-weight: bold;
      text-decoration: underline;
      text-align: center;
      margin-bottom: 20px;
    }
    .content {
      text-align: justify;
      margin-bottom: 20px;
    }
    .content p {
      margin-bottom: 15px;
    }
    .student-details {
      margin: 20px 0;
      padding: 15px;
      border: 1px solid #333;
    }
    .student-details table {
      width: 100%;
    }
    .student-details td {
      padding: 5px 10px;
    }
    .student-details td:first-child {
      font-weight: bold;
      width: 200px;
    }
    .closing {
      margin-top: 30px;
    }
    .signature-block {
      margin-top: 60px;
    }
    .signature-line {
      width: 250px;
      border-bottom: 1px solid #333;
      margin-bottom: 5px;
    }
    .print-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #1a5f2a;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover {
      background: #15522a;
    }
  </style>
</head>
<body>
  <div class="header">
    ${institution.logo_url ? `<img src="${institution.logo_url}" alt="Logo">` : ''}
    <h1>${institution.name}</h1>
    <h2>${institution.tp_unit_name || 'Teaching Practice Coordination Unit'}</h2>
    <p>${institution.address || ''}</p>
    <p>Email: ${institution.email || ''} | Phone: ${institution.phone || ''}</p>
  </div>

  <div class="ref-date">
    <div>
      <strong>Ref:</strong> TP/${session.code}/${student.registration_number?.replace(/\//g, '-') || student.id}
    </div>
    <div>
      <strong>Date:</strong> ${currentDate}
    </div>
  </div>

  <div class="address">
    <p><strong>The Principal/Head Teacher</strong></p>
    <p>______________________________________</p>
    <p>______________________________________</p>
    <p>______________________________________</p>
  </div>

  <p class="salutation">Dear Sir/Madam,</p>

  <p class="subject">LETTER OF INTRODUCTION FOR TEACHING PRACTICE - ${session.name} SESSION</p>

  <div class="content">
    <p>
      We write to introduce the student whose details are contained below, who is a bona fide 
      student of ${institution.name}. The student is required to undergo a mandatory Teaching 
      Practice exercise as part of the requirements for the award of degree/certificate.
    </p>

    <div class="student-details">
      <table>
        <tr>
          <td>Name:</td>
          <td><strong>${student.full_name.toUpperCase()}</strong></td>
        </tr>
        <tr>
          <td>Registration Number:</td>
          <td><strong>${student.registration_number}</strong></td>
        </tr>
        <tr>
          <td>Programme:</td>
          <td><strong>${student.program_name || 'N/A'}</strong></td>
        </tr>
        <tr>
          <td>Department:</td>
          <td><strong>${student.department_name || 'N/A'}</strong></td>
        </tr>
        <tr>
          <td>Session:</td>
          <td><strong>${session.name}</strong></td>
        </tr>
      </table>
    </div>

    <p>
      We kindly request that you give the student a favourable consideration for posting to your 
      school. If accepted, please sign and stamp the attached Acceptance Form and return it to 
      the student.
    </p>

    <p>
      Thank you for your anticipated cooperation.
    </p>
  </div>

  <div class="closing">
    <p>Yours faithfully,</p>
    <div class="signature-block">
      <div class="signature-line"></div>
      <p><strong>Head, Teaching Practice Unit</strong></p>
      <p>${institution.name}</p>
    </div>
  </div>

  <button class="print-btn no-print" onclick="window.print()">Print Letter</button>
</body>
</html>
    `.trim();
  }

  /**
   * Generate Acceptance Form Template HTML
   * @param {Object} student - Student record
   * @param {Object} session - Academic session
   * @param {Object} institution - Institution details
   * @returns {string} HTML document
   */
  static async generateAcceptanceFormTemplate(student, session, institution) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Acceptance Form - ${student.full_name}</title>
  <style>
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 14px;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px double #333;
      padding-bottom: 20px;
    }
    .header img {
      max-height: 80px;
      margin-bottom: 10px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .header h2 {
      font-size: 14px;
      font-weight: normal;
      text-transform: uppercase;
    }
    .title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 30px;
      text-transform: uppercase;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 15px;
    }
    .form-row {
      display: flex;
      margin-bottom: 12px;
      align-items: flex-end;
    }
    .form-row label {
      min-width: 180px;
      font-weight: bold;
    }
    .form-row .field {
      flex: 1;
      border-bottom: 1px dotted #333;
      min-height: 20px;
      padding-left: 10px;
    }
    .form-row .field.prefilled {
      font-weight: normal;
    }
    .instructions {
      background: #f9f9f9;
      border: 1px solid #ddd;
      padding: 15px;
      margin-bottom: 25px;
      font-size: 13px;
    }
    .instructions h4 {
      margin-bottom: 10px;
    }
    .instructions ol {
      margin-left: 20px;
    }
    .instructions li {
      margin-bottom: 5px;
    }
    .declaration {
      border: 2px solid #333;
      padding: 20px;
      margin: 25px 0;
    }
    .declaration h4 {
      text-align: center;
      margin-bottom: 15px;
    }
    .signature-section {
      margin-top: 40px;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .signature-block {
      width: 45%;
    }
    .signature-line {
      border-bottom: 1px solid #333;
      height: 50px;
    }
    .signature-label {
      text-align: center;
      margin-top: 5px;
      font-size: 12px;
    }
    .stamp-area {
      border: 2px dashed #666;
      height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 20px;
    }
    .stamp-area span {
      color: #666;
      font-style: italic;
    }
    .print-btn {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 24px;
      background: #1a5f2a;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover {
      background: #15522a;
    }
  </style>
</head>
<body>
  <div class="header">
    ${institution.logo_url ? `<img src="${institution.logo_url}" alt="Logo">` : ''}
    <h1>${institution.name}</h1>
    <h2>${institution.tp_unit_name || 'Teaching Practice Coordination Unit'}</h2>
  </div>

  <p class="title">Teaching Practice Acceptance Form - ${session.name} Session</p>

  <div class="instructions">
    <h4>Instructions:</h4>
    <ol>
      <li>Present this form along with the Introduction Letter to your prospective school.</li>
      <li>The Principal/Head Teacher should complete Part B and sign.</li>
      <li>Ensure the school's official stamp is affixed.</li>
      <li>Take a clear photo of the completed form for submission.</li>
    </ol>
  </div>

  <div class="section">
    <h4 class="section-title">PART A: STUDENT INFORMATION (Pre-filled)</h4>
    <div class="form-row">
      <label>Full Name:</label>
      <div class="field prefilled">${student.full_name.toUpperCase()}</div>
    </div>
    <div class="form-row">
      <label>Registration Number:</label>
      <div class="field prefilled">${student.registration_number}</div>
    </div>
    <div class="form-row">
      <label>Programme:</label>
      <div class="field prefilled">${student.program_name || 'N/A'}</div>
    </div>
    <div class="form-row">
      <label>Department:</label>
      <div class="field prefilled">${student.department_name || 'N/A'}</div>
    </div>
    <div class="form-row">
      <label>Phone Number:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>Email:</label>
      <div class="field"></div>
    </div>
  </div>

  <div class="section">
    <h4 class="section-title">PART B: SCHOOL INFORMATION (To be completed by the School)</h4>
    <div class="form-row">
      <label>School Name:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>School Address:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>Ward:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>L.G.A:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>State:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>Principal's Name:</label>
      <div class="field"></div>
    </div>
    <div class="form-row">
      <label>Principal's Phone:</label>
      <div class="field"></div>
    </div>
  </div>

  <div class="declaration">
    <h4>DECLARATION BY THE PRINCIPAL/HEAD TEACHER</h4>
    <p>
      I hereby accept <strong>${student.full_name.toUpperCase()}</strong> 
      (Reg. No: <strong>${student.registration_number}</strong>) for Teaching Practice 
      exercise at our school for the ${session.name} session. The student will be 
      provided with adequate support and supervision during the Teaching Practice period.
    </p>
  </div>

  <div class="signature-section">
    <div class="signature-row">
      <div class="signature-block">
        <div class="signature-line"></div>
        <p class="signature-label">Signature of Principal/Head Teacher</p>
      </div>
      <div class="signature-block">
        <div class="signature-line"></div>
        <p class="signature-label">Date</p>
      </div>
    </div>

    <div class="stamp-area">
      <span>Official School Stamp</span>
    </div>
  </div>

  <button class="print-btn no-print" onclick="window.print()">Print Form</button>
</body>
</html>
    `.trim();
  }
}

module.exports = DocumentService;
