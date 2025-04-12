const express = require('express');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'Uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'Uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|pdf/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only JPG, PNG, and PDF files are allowed'));
  },
});

// Database connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'employee_onboarding',
  password: 'root',
  port: 5432,
});

// Test database connection
pool.connect((err) => {
  if (err) {
    console.error('Database connection error:', err.stack);
    process.exit(1);
  }
  console.log('Connected to PostgreSQL database');
});

// API endpoint to handle form submission
app.post(
  '/api/submit-onboarding',
  upload.fields([
    { name: 'aadhaarFile', maxCount: 1 },
    { name: 'panFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 },
    { name: 'educationDocs', maxCount: 5 },
    { name: 'employmentDocs', maxCount: 5 },
  ]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Extract form data
      const {
        fullName,
        email,
        phoneNo,
        alternateNumber,
        guardianName,
        guardianContact,
        maritalStatus,
        gender,
        bloodGroup,
        dateOfBirth,
        employmentStatus,
        aadharNo,
        panNo,
        pfNo,
        uanNo,
        currentAddress,
        currentCity,
        currentState,
        currentPincode,
        permanentAddress,
        permanentCity,
        permanentState,
        permanentPincode,
        bankNameAsPerForm: bankName,
        accountNo,
        ifscCode,
        branchName,
        educationDetails,
        employmentDetails,
        consentCheckbox,
      } = req.body;

      // Log received data for debugging
      console.log('Received form data:', {
        fullName,
        email,
        employmentStatus,
        educationDetails,
        employmentDetails,
      });

      // Validate required fields
      if (
        !fullName ||
        !email ||
        !phoneNo ||
        !maritalStatus ||
        !gender ||
        !bloodGroup ||
        !dateOfBirth ||
        !employmentStatus || // Ensure employmentStatus is present
        !aadharNo ||
        !panNo ||
        !currentAddress ||
        !currentCity ||
        !currentState ||
        !currentPincode ||
        !permanentAddress ||
        !permanentCity ||
        !permanentState ||
        !permanentPincode ||
        !bankName ||
        !accountNo ||
        !ifscCode ||
        !branchName ||
        !consentCheckbox
      ) {
        throw new Error('All required fields must be provided');
      }

      // Validate employmentStatus type and value
      if (typeof employmentStatus !== 'string' || !['fresher', 'experienced'].includes(employmentStatus.toLowerCase())) {
        console.warn('Invalid employmentStatus:', employmentStatus);
        throw new Error('employmentStatus must be "fresher" or "experienced"');
      }

      // Validate files
      if (!req.files['aadhaarFile'] || !req.files['panFile'] || !req.files['signatureFile']) {
        throw new Error('Aadhar, PAN, and signature files are required');
      }

      // Insert into employees table
      const employeeResult = await client.query(
        `INSERT INTO employees (
          full_name, email, phone_no, alternate_number, guardian_name, guardian_contact,
          marital_status, gender, blood_group, date_of_birth, employment_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          fullName,
          email,
          phoneNo,
          alternateNumber || null,
          guardianName || null,
          guardianContact || null,
          maritalStatus,
          gender,
          bloodGroup,
          dateOfBirth,
          employmentStatus.toLowerCase(), // Normalize to lowercase
        ]
      );

      const employeeId = employeeResult.rows[0].id;

      // Insert into government_ids table
      await client.query(
        `INSERT INTO government_ids (
          employee_id, aadhar_no, aadhar_file, pan_no, pan_file
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          employeeId,
          aadharNo,
          req.files['aadhaarFile'][0].path,
          panNo,
          req.files['panFile'][0].path,
        ]
      );

      // Insert into previous_employment table (if provided)
      if (pfNo || uanNo) {
        await client.query(
          `INSERT INTO previous_employment (
            employee_id, pf_no, uan_no
          ) VALUES ($1, $2, $3)`,
          [employeeId, pfNo || null, uanNo || null]
        );
      }

      // Insert into addresses table
      await client.query(
        `INSERT INTO addresses (
          employee_id, current_address, current_city, current_state, current_pincode,
          permanent_address, permanent_city, permanent_state, permanent_pincode
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          employeeId,
          currentAddress,
          currentCity,
          currentState,
          currentPincode,
          permanentAddress,
          permanentCity,
          permanentState,
          permanentPincode,
        ]
      );

      // Insert into bank_details table
      await client.query(
        `INSERT INTO bank_details (
          employee_id, bank_name, account_no, ifsc_code, branch_name
        ) VALUES ($1, $2, $3, $4, $5)`,
        [employeeId, bankName, accountNo, ifscCode, branchName]
      );

      // Parse and insert education details
      const educationArray = educationDetails ? JSON.parse(educationDetails) : [];
      if (educationArray && educationArray.length > 0) {
        for (let i = 0; i < educationArray.length; i++) {
          const edu = educationArray[i];
          const docPath = req.files['educationDocs'] && req.files['educationDocs'][i] ? req.files['educationDocs'][i].path : null;
          await client.query(
            `INSERT INTO education (
              employee_id, level, stream, institution, year, score, doc_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              employeeId,
              edu.level,
              edu.stream,
              edu.institution,
              edu.year,
              edu.score,
              docPath,
            ]
          );
        }
      }

      // Parse and insert employment details (if experienced)
      if (employmentStatus.toLowerCase() === 'experienced') {
        let employmentArray;
        try {
          employmentArray = employmentDetails ? JSON.parse(employmentDetails) : [];
          console.log('Parsed employmentDetails:', employmentArray);
        } catch (err) {
          console.error('Error parsing employmentDetails:', err.message);
          throw new Error('Invalid employmentDetails format');
        }
        if (employmentArray && employmentArray.length > 0) {
          for (let i = 0; i < employmentArray.length; i++) {
            const emp = employmentArray[i];
            const docPath = req.files['employmentDocs'] && req.files['employmentDocs'][i] ? req.files['employmentDocs'][i].path : null;
            await client.query(
              `INSERT INTO employment_history (
                employee_id, company_name, designation, last_project, start_date, end_date, doc_path
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                employeeId,
                emp.companyName || null,
                emp.designation || null,
                emp.lastProject || null,
                emp.companyStartDate || null,
                emp.companyEndDate || null,
                docPath,
              ]
            );
          }
        } else {
          console.warn('No employment details provided for experienced employee');
        }
      } else {
        console.log('Employee marked as fresher, skipping employment history');
      }

      // Insert into signatures table
      await client.query(
        `INSERT INTO signatures (
          employee_id, signature_file, consent, status
        ) VALUES ($1, $2, $3, $4)`,
        [
          employeeId,
          req.files['signatureFile'][0].path,
          consentCheckbox === 'true',
          'pending',
        ]
      );

      await client.query('COMMIT');
      res.status(200).json({ message: 'Form submitted successfully', employeeId });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error processing form:', error.message);

      // Clean up uploaded files in case of error
      if (req.files) {
        Object.values(req.files).flat().forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch (err) {
            console.error('Error deleting file:', err.message);
          }
        });
      }

      res.status(500).json({ error: error.message || 'Internal server error' });
    } finally {
      client.release();
    }
  }
);
// GET all employees with joined data
app.get('/api/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.id, e.full_name, e.email, e.phone_no, e.alternate_number, e.guardian_name, 
        e.guardian_contact, e.marital_status, e.gender, e.blood_group, e.date_of_birth, e.employment_status,
        g.aadhar_no, g.aadhar_file, g.pan_no, g.pan_file, 
        p.pf_no, p.uan_no,
        a.current_address, a.current_city, a.current_state, a.current_pincode,
        a.permanent_address, a.permanent_city, a.permanent_state, a.permanent_pincode,
        b.bank_name, b.account_no, b.ifsc_code, b.branch_name,
        s.signature_file, s.consent, s.status
      FROM employees e
      LEFT JOIN government_ids g ON e.id = g.employee_id
      LEFT JOIN previous_employment p ON e.id = p.employee_id
      LEFT JOIN addresses a ON e.id = a.employee_id
      LEFT JOIN bank_details b ON e.id = b.employee_id
      LEFT JOIN signatures s ON e.id = s.employee_id
    `);

    const employees = result.rows.map(employee => ({
      id: employee.id,
      fullName: employee.full_name,
      email: employee.email,
      phoneNo: employee.phone_no,
      alternateNumber: employee.alternate_number,
      guardianName: employee.guardian_name,
      guardianContact: employee.guardian_contact,
      maritalStatus: employee.marital_status,
      gender: employee.gender,
      bloodGroup: employee.blood_group,
      dateOfBirth: employee.date_of_birth,
      employmentStatus: employee.employment_status,
      aadharNo: employee.aadhar_no,
      aadharFile: employee.aadhar_file ? `http://localhost:3000/${employee.aadhar_file}` : null,
      panNo: employee.pan_no,
      panFile: employee.pan_file ? `http://localhost:3000/${employee.pan_file}` : null,
      pfNo: employee.pf_no,
      uanNo: employee.uan_no,
      currentAddress: employee.current_address,
      currentCity: employee.current_city,
      currentState: employee.current_state,
      currentPincode: employee.current_pincode,
      permanentAddress: employee.permanent_address,
      permanentCity: employee.permanent_city,
      permanentState: employee.permanent_state,
      permanentPincode: employee.permanent_pincode,
      bankNameAsPerForm: employee.bank_name,
      accountNo: employee.account_no,
      ifscCode: employee.ifsc_code,
      branchName: employee.branch_name,
      signature: employee.signature_file ? `http://localhost:3000/${employee.signature_file}` : null,
      consent: employee.consent,
      status: employee.status || 'pending'
    }));

    const [educationResult, employmentResult] = await Promise.all([
      pool.query('SELECT * FROM education'),
      pool.query('SELECT * FROM employment_history')
    ]);

    employees.forEach(employee => {
      employee.educationDetails = educationResult.rows
        .filter(edu => edu.employee_id === employee.id)
        .map(edu => ({
          level: edu.level,
          stream: edu.stream,
          institution: edu.institution,
          year: edu.year,
          score: edu.score,
          doc: edu.doc_path ? `http://localhost:3000/${edu.doc_path}` : null
        }));

      employee.employmentDetails = employmentResult.rows
        .filter(emp => emp.employee_id === employee.id)
        .map(emp => ({
          companyName: emp.company_name,
          designation: emp.designation,
          department: emp.department,
          lastProject: emp.last_project,
          companyStartDate: emp.start_date,
          companyEndDate: emp.end_date,
          doc: emp.doc_path ? `http://localhost:3000/${emp.doc_path}` : null
        }));
    });

    res.json(employees);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database query error', details: err.message });
  }
});

// PUT update employee status
app.put('/api/employees/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await pool.query(
      'UPDATE signatures SET status = $1 WHERE employee_id = $2',
      [status, id]
    );
    res.json({ message: 'Status updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error updating status', details: err.message });
  }
});

// DELETE all employees
app.delete('/api/employees', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tables = ['signatures', 'employment_history', 'education', 'bank_details', 'addresses', 'previous_employment', 'government_ids', 'employees'];
    for (const table of tables) {
      await client.query(`DELETE FROM ${table}`);
    }

    fs.readdirSync('./Uploads').forEach(file => fs.unlinkSync(path.join('./Uploads', file)));

    await client.query('COMMIT');
    res.json({ message: 'All records cleared successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error clearing records', details: err.message });
  } finally {
    client.release();
  }
});

// Download endpoint
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'Uploads', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('File send error:', err);
      res.status(500).json({ error: 'Error sending file' });
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});