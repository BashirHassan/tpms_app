const mockDb = require('../mocks/database');

jest.mock('../../src/db/database', () => mockDb);
jest.mock('../../src/models/Institution', () => ({ findById: jest.fn() }));
jest.mock('../../src/services/paystackService', () => ({ initializeTransaction: jest.fn() }));

const Institution = require('../../src/models/Institution');
const paystackService = require('../../src/services/paystackService');
const { ValidationError } = require('../../src/utils/errors');
const paymentController = require('../../src/controllers/paymentController');

function makeRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

/**
 * A per-student institution with nothing paid yet, so initialization always
 * reaches Paystack. The student's program is null to skip the programs lookup.
 */
function mockPayableStudent() {
  mockDb.setMockResult('FROM academic_sessions', [{ id: 4, name: '2024/2025', institution_id: 2 }]);
  mockDb.setMockResult('FROM students', [{
    id: 7,
    institution_id: 2,
    registration_number: 'NCE/2021/0042',
    full_name: 'Amina Yusuf',
    program_id: null,
    total_paid: '0.00',
    payment_status: 'pending',
  }]);
  mockDb.setMockResult('FROM student_payments', [{ count: 0, total_paid: 0 }]);

  Institution.findById.mockResolvedValue({
    id: 2,
    name: 'Demo College of Education',
    code: 'DEMO',
    payment_enabled: 1,
    payment_type: 'per_student',
    payment_base_amount: '5000.00',
    payment_program_pricing: null,
    paystack_secret_key: 'sk_test_0000',
    paystack_public_key: 'pk_test_0000',
    paystack_split_code: null,
  });
  paystackService.initializeTransaction.mockResolvedValue({
    success: true,
    data: {
      reference: 'ps_ref_1',
      access_code: 'access_1',
      authorization_url: 'https://checkout.paystack.com/access_1',
    },
  });
}

async function initialize(body) {
  const req = { student: { id: 7, institution_id: 2 }, body: { session_id: 4, ...body } };
  const res = makeRes();
  const next = jest.fn();
  await paymentController.initializeStudentPayment(req, res, next);
  return { res, next };
}

describe('paymentController.initializeStudentPayment - receipt email', () => {
  beforeEach(mockPayableStudent);

  afterEach(() => {
    mockDb.resetMocks();
    jest.clearAllMocks();
  });

  it.each([
    ['amina@example.com', 'amina@example.com'],
    ['  Amina.Yusuf@Example.COM ', 'amina.yusuf@example.com'],
  ])('sends the student-provided email %p to Paystack as %p', async (provided, sent) => {
    const { res, next } = await initialize({ email: provided });

    expect(next).not.toHaveBeenCalled();
    expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ email: sent })
    );
    expect(res.json.mock.calls[0][0].data.email).toBe(sent);
  });

  it.each([
    ['omitted', undefined],
    ['empty', ''],
  ])('falls back to the generated address when the email is %s', async (_label, email) => {
    const { res } = await initialize(email === undefined ? {} : { email });

    expect(paystackService.initializeTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'NCE_2021_0042@student.sitpms.com' })
    );
    expect(res.json.mock.calls[0][0].data.email).toBe('NCE_2021_0042@student.sitpms.com');
  });

  it('rejects a malformed email without contacting Paystack', async () => {
    const { res, next } = await initialize({ email: 'amina-at-example' });

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect(paystackService.initializeTransaction).not.toHaveBeenCalled();
    expect(mockDb.wasQueryExecuted('INSERT INTO pending_transactions')).toBe(false);
    expect(res.json).not.toHaveBeenCalled();
  });
});
