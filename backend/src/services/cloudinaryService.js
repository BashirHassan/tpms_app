/**
 * Cloudinary Service
 *
 * Handles image uploads to Cloudinary for DigitalTP.
 * All uploads are stored under the "digitaltp" folder with naming convention:
 * digitaltp/{institution_code}/{session_name}/{type}/{filename}
 */

const cloudinary = require('cloudinary').v2;
const config = require('../config');

// Configure Cloudinary on module load
const initializeCloudinary = () => {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;

  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    console.log('[Cloudinary] Configured successfully');
    return true;
  }

  console.warn('[Cloudinary] Not configured - missing credentials');
  return false;
};

// Initialize on load
const isConfigured = initializeCloudinary();

/**
 * Check if Cloudinary is properly configured
 * @returns {boolean}
 */
const checkConfigured = () => {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  return !!(cloudName && apiKey && apiSecret);
};

/**
 * Generate folder path for uploads
 * @param {Object} options
 * @param {string} options.institutionCode - Institution code (e.g., 'FUKASHERE', 'FCETGOMBE')
 * @param {string} options.sessionName - Academic session name (e.g., '2024-2025')
 * @param {string} options.type - Upload type (e.g., 'acceptances', 'students', 'schools', 'logos')
 * @returns {string} Folder path
 */
const generateFolderPath = ({ institutionCode, sessionName, type = 'acceptances' }) => {
  // Sanitize inputs - remove spaces and special characters
  const sanitizedInstitution = (institutionCode || 'unknown')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '_');
  const sanitizedSession = (sessionName || 'unknown')
    .replace(/[^A-Za-z0-9_-]/g, '_');
  const sanitizedType = (type || 'uploads')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');

  // For logos, use a different folder structure: digitaltp/logos/{institution_code}
  if (type === 'logos') {
    return `digitaltp/logos/${sanitizedInstitution}`;
  }

  return `digitaltp/${sanitizedInstitution}/${sanitizedSession}/${sanitizedType}`;
};

/**
 * Generate public ID for an upload
 * @param {Object} options
 * @param {string} options.institutionCode - Institution code
 * @param {string} options.sessionName - Academic session name
 * @param {string} options.studentId - Student ID or registration number
 * @param {string} options.type - Upload type
 * @returns {string} Public ID
 */
const generatePublicId = ({ institutionCode, sessionName, studentId, type = 'acceptances' }) => {
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e6);
  const sanitizedStudentId = (studentId || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_');

  return `${type}-${sanitizedStudentId}-${timestamp}-${random}`;
};

/**
 * Upload an image to Cloudinary
 *
 * @param {Buffer|string|Object} file - File buffer, base64 string, file path, or multer file object
 * @param {Object} options - Upload options
 * @param {string} options.institutionCode - Institution code for folder organization
 * @param {string} options.sessionName - Session name for folder organization
 * @param {string} options.studentId - Student identifier for filename
 * @param {string} options.type - Type of upload (default: 'acceptances')
 * @param {string} options.originalFilename - Original filename for reference
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadImage = async (file, options = {}) => {
  if (!checkConfigured()) {
    throw new Error(
      'Cloudinary is not properly configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
    );
  }

  const { institutionCode, sessionName, studentId, type = 'acceptances', originalFilename } = options;

  // Generate folder and public ID
  const folder = generateFolderPath({ institutionCode, sessionName, type });
  const publicId = generatePublicId({ institutionCode, sessionName, studentId, type });

  const uploadOptions = {
    resource_type: 'image',
    folder,
    public_id: publicId,
    allowed_formats: ['jpg', 'jpeg', 'png'],
    max_bytes: 5 * 1024 * 1024, // 5MB max
    transformation: [{ quality: 'auto' }, { fetch_format: 'auto' }],
    // Store original filename in context
    context: originalFilename ? { original_filename: originalFilename } : undefined,
  };

  try {
    // Handle different file input types
    let uploadSource;

    if (Buffer.isBuffer(file)) {
      // Convert buffer to base64 data URI
      uploadSource = `data:image/jpeg;base64,${file.toString('base64')}`;
    } else if (typeof file === 'string') {
      // Could be base64, file path, or URL
      uploadSource = file;
    } else if (file.path) {
      // Multer file object
      uploadSource = file.path;
    } else if (file.buffer) {
      // Multer memory storage
      uploadSource = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    } else {
      throw new Error('Invalid file input: must be a Buffer, string (path/base64), or multer file object');
    }

    const result = await cloudinary.uploader.upload(uploadSource, uploadOptions);

    return {
      publicId: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      resourceType: result.resource_type,
      createdAt: result.created_at,
      folder: folder,
    };
  } catch (error) {
    console.error('[Cloudinary] Upload error:', error);

    // Extract error message from various error formats
    const errorMessage = error?.message || error?.error?.message || String(error);

    // Provide user-friendly error messages
    if (errorMessage?.includes('File size too large')) {
      throw new Error('Image file is too large. Maximum size is 5MB.');
    }
    if (errorMessage?.includes('Invalid image file')) {
      throw new Error('Invalid image file. Please upload a valid image (JPG or PNG).');
    }
    if (errorMessage?.includes('Must supply api_key') || errorMessage?.includes('Invalid API Key')) {
      throw new Error('Cloudinary API key is invalid or missing.');
    }
    if (errorMessage?.includes('cloud_name') || errorMessage?.includes('Unknown cloud')) {
      throw new Error('Cloudinary cloud name is invalid.');
    }
    // Network-related errors
    if (
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      errorMessage?.includes('ENOTFOUND') ||
      errorMessage?.includes('network') ||
      errorMessage?.includes('getaddrinfo')
    ) {
      throw new Error('Network error: Unable to connect to Cloudinary. Please check your internet connection.');
    }

    throw new Error(`Failed to upload image: ${errorMessage || 'Unknown error'}`);
  }
};

/**
 * Delete an image from Cloudinary
 *
 * @param {string} publicId - The public ID of the image to delete
 * @returns {Promise<Object>} Deletion result
 */
const deleteImage = async (publicId) => {
  if (!checkConfigured()) {
    throw new Error('Cloudinary is not properly configured.');
  }

  if (!publicId) {
    throw new Error('Public ID is required for deletion.');
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    return {
      success: result.result === 'ok',
      result: result.result,
    };
  } catch (error) {
    console.error('[Cloudinary] Delete error:', error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
};

/**
 * Extract public ID from Cloudinary URL
 *
 * @param {string} url - Cloudinary URL
 * @returns {string|null} Public ID or null if not a valid Cloudinary URL
 */
const extractPublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') return null;

  // Match Cloudinary URL pattern
  const match = url.match(/\/v\d+\/(.+?)(?:\.[a-z]+)?$/);
  return match ? match[1] : null;
};

/**
 * Get a transformed URL for an image
 *
 * @param {string} publicId - The public ID of the image
 * @param {Object} options - Transformation options
 * @returns {string} Transformed URL
 */
const getTransformedUrl = (publicId, options = {}) => {
  if (!checkConfigured() || !publicId) {
    return '';
  }

  const { width, height, crop = 'fill', quality = 'auto', format = 'auto' } = options;

  const transformations = [];

  if (width || height) {
    transformations.push({ width, height, crop });
  }

  transformations.push({ quality, fetch_format: format });

  try {
    return cloudinary.url(publicId, {
      secure: true,
      transformation: transformations,
    });
  } catch (error) {
    console.warn('[Cloudinary] URL generation failed:', error.message);
    return '';
  }
};

/**
 * Get a thumbnail URL for an image
 *
 * @param {string} publicId - The public ID of the image
 * @param {number} size - Thumbnail size (default: 150)
 * @returns {string} Thumbnail URL
 */
const getThumbnailUrl = (publicId, size = 150) => {
  return getTransformedUrl(publicId, {
    width: size,
    height: size,
    crop: 'fill',
  });
};

/**
 * Upload an institution logo to Cloudinary
 * Logos are stored in: digitaltp/logos/{institution_code}/
 *
 * @param {Buffer|string|Object} file - File buffer, base64 string, file path, or multer file object
 * @param {Object} options - Upload options
 * @param {string} options.institutionCode - Institution code for folder organization
 * @param {string} options.originalFilename - Original filename for reference
 * @returns {Promise<Object>} Cloudinary upload result
 */
const uploadLogo = async (file, options = {}) => {
  if (!checkConfigured()) {
    throw new Error(
      'Cloudinary is not properly configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
    );
  }

  const { institutionCode, originalFilename } = options;

  // Generate folder path for logos
  const folder = generateFolderPath({ institutionCode, type: 'logos' });
  const timestamp = Date.now();
  const publicId = `logo-${timestamp}`;

  const uploadOptions = {
    resource_type: 'image',
    folder,
    public_id: publicId,
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    max_bytes: 2 * 1024 * 1024, // 2MB max for logos
    transformation: [{ quality: 'auto' }, { fetch_format: 'auto' }],
    context: originalFilename ? { original_filename: originalFilename } : undefined,
  };

  try {
    let uploadSource;

    if (Buffer.isBuffer(file)) {
      uploadSource = `data:image/png;base64,${file.toString('base64')}`;
    } else if (typeof file === 'string') {
      uploadSource = file;
    } else if (file.path) {
      uploadSource = file.path;
    } else if (file.buffer) {
      uploadSource = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    } else {
      throw new Error('Invalid file input');
    }

    const result = await cloudinary.uploader.upload(uploadSource, uploadOptions);

    return {
      publicId: result.public_id,
      url: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      folder: folder,
    };
  } catch (error) {
    console.error('[Cloudinary] Logo upload error:', error);
    const errorMessage = error?.message || error?.error?.message || String(error);

    if (errorMessage?.includes('File size too large')) {
      throw new Error('Logo file is too large. Maximum size is 2MB.');
    }
    if (errorMessage?.includes('Invalid image file')) {
      throw new Error('Invalid image file. Please upload a valid image.');
    }

    throw new Error(`Failed to upload logo: ${errorMessage || 'Unknown error'}`);
  }
};

module.exports = {
  isConfigured,
  checkConfigured,
  uploadImage,
  uploadLogo,
  deleteImage,
  extractPublicIdFromUrl,
  getTransformedUrl,
  getThumbnailUrl,
  generateFolderPath,
  generatePublicId,
};
