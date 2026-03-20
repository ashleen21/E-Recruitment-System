const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');

// Base upload directory (absolute path)
const UPLOAD_BASE = path.join(__dirname, '../../uploads');

// Ensure upload directories exist
const ensureUploadDirs = () => {
    const dirs = [
        UPLOAD_BASE,
        path.join(UPLOAD_BASE, 'resumes'),
        path.join(UPLOAD_BASE, 'photos'),
        path.join(UPLOAD_BASE, 'documents'),
        path.join(UPLOAD_BASE, 'flyers')
    ];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

// Ensure directories exist on load
ensureUploadDirs();

// Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = UPLOAD_BASE;
        
        if (file.fieldname === 'resume') {
            uploadPath = path.join(UPLOAD_BASE, 'resumes');
        } else if (file.fieldname === 'photo') {
            uploadPath = path.join(UPLOAD_BASE, 'photos');
        } else if (file.fieldname === 'documents' || file.fieldname === 'document') {
            uploadPath = path.join(UPLOAD_BASE, 'documents');
        }
        
        // Ensure the specific directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// File Filter
const fileFilter = (req, file, cb) => {
    // Check file type
    if (config.upload.allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
    }
};

// Create Multer Instance
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: config.upload.maxFileSize
    }
});

// Resume Upload Middleware - wrapped to catch errors
const uploadResume = (req, res, next) => {
    upload.single('resume')(req, res, (err) => {
        if (err) {
            console.error('Multer resume upload error:', err);
            return next(err);
        }
        next();
    });
};

// Multiple Documents Upload - wrapped to catch errors
const uploadDocuments = (req, res, next) => {
    upload.array('documents', 5)(req, res, (err) => {
        if (err) {
            console.error('Multer documents upload error:', err);
            return next(err);
        }
        next();
    });
};

// Photo Upload - wrapped to catch errors
const uploadPhoto = (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
        if (err) {
            console.error('Multer photo upload error:', err);
            return next(err);
        }
        next();
    });
};

// Error Handler for Multer
const handleUploadError = (err, req, res, next) => {
    console.error('Upload error handler:', err);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ 
                error: 'File is too large. Maximum size is 10MB.' 
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ 
                error: 'Unexpected field name for file upload.' 
            });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
        return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
};

module.exports = {
    uploadResume,
    uploadDocuments,
    uploadPhoto,
    handleUploadError
};
