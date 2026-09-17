const mockQuery = jest.fn();

jest.mock('../../src/db/database', () => ({
  query: mockQuery,
  transaction: jest.fn(),
}));

jest.mock('../../src/services/encryptionService', () => ({
  encryptStudentPin: jest.fn(() => 'encrypted-pin'),
  decryptStudentPin: jest.fn(),
}));

jest.mock('../../src/controllers/authController', () => ({
  hashPassword: jest.fn(async () => 'hashed-pin'),
  BULK_BCRYPT_ROUNDS: 4,
}));

const { hashPassword } = require('../../src/controllers/authController');
const studentController = require('../../src/controllers/studentController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('student controller individual program validation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    hashPassword.mockClear();
  });

  it('keeps registration_number in the validated update body', async () => {
    const parsed = await studentController.schemas.update.parseAsync({
      body: { full_name: 'UPDATED NAME', registration_number: 'NCE/2026/MATH/002' },
      params: { institutionId: '1', id: '7' },
    });

    expect(parsed.body.registration_number).toBe('NCE/2026/MATH/002');
  });

  it('updates the registration number and its auto-detected program', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 7, session_id: 3, registration_number: 'NCE/2026/ENG/002' }])
      .mockResolvedValueOnce([{ id: 12, name: 'Mathematics', code: 'NCE-MATH' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce({ affectedRows: 1 })
      .mockResolvedValueOnce([{ id: 7, registration_number: 'NCE/2026/MATH/002', program_id: 12 }]);

    const req = {
      params: { institutionId: '1', id: '7' },
      body: { full_name: 'Updated Name', registration_number: 'nce/2026/math/002' },
      user: { id: 4 },
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const next = jest.fn();

    await studentController.update(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockQuery.mock.calls[3][0]).toContain('registration_number = ?');
    expect(mockQuery.mock.calls[3][0]).toContain('program_id = ?');
    expect(mockQuery.mock.calls[3][1]).toEqual([
      'UPDATED NAME',
      'NCE/2026/MATH/002',
      12,
      7,
      1,
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects a duplicate registration number in the same session', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 7, session_id: 3, registration_number: 'NCE/2026/ENG/002' }])
      .mockResolvedValueOnce([{ id: 12, name: 'Mathematics', code: 'NCE-MATH' }])
      .mockResolvedValueOnce([{ id: 8 }]);

    const req = {
      params: { institutionId: '1', id: '7' },
      body: { registration_number: 'NCE/2026/MATH/002' },
      user: { id: 4 },
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const next = jest.fn();

    await studentController.update(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects individual creation when no active program code matches', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 3 }])
      .mockResolvedValueOnce([{ id: 12, name: 'Mathematics', code: 'NCE-MATH' }]);

    const req = {
      params: { institutionId: '1' },
      body: { full_name: 'Unknown Program', registration_number: 'NCE/2026/UNKNOWN/001' },
      user: { id: 4 },
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const next = jest.fn();

    await studentController.create(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('rejects individual creation when the registration already exists', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 3 }])
      .mockResolvedValueOnce([{ id: 12, name: 'Mathematics', code: 'NCE-MATH' }])
      .mockResolvedValueOnce([{ id: 8 }]);

    const req = {
      params: { institutionId: '1' },
      body: { full_name: 'Duplicate Student', registration_number: 'NCE/2026/MATH/001' },
      user: { id: 4 },
      ip: '127.0.0.1',
    };
    const res = createResponse();
    const next = jest.fn();

    await studentController.create(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});