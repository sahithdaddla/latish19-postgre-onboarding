const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// PostgreSQL Connection
const db = new Pool({
    user: 'postgres',        // Replace with your PostgreSQL username
    host: 'localhost',
    database: 'employee_onboarding',
    password: 'root',        // Replace with your PostgreSQL password
    port: 5432              // Default PostgreSQL port
});

// Test connection
db.connect()
    .then(() => console.log('PostgreSQL Connected...'))
    .catch(err => console.error('Connection error', err.stack));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        cb(null, true);
    }
}).fields([
    { name: 'aadhaarFile', maxCount: 1 },
    { name: 'panFile', maxCount: 1 },
    { name: 'signatureFile', maxCount: 1 },
    { name: 'educationDocs', maxCount: 10 },
    { name: 'employmentDocs', maxCount: 10 }
]);

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
    fs.mkdirSync('./uploads');
}

// POST endpoint for submitting onboarding data
app.post('/api/submit-onboarding', (req, res, next) => {
    upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            console.log('Multer Error:', err);
            return res.status(400).json({ error: `Multer error: ${err.message}`, field: err.field });
        } else if (err) {
            console.log('Unknown Error:', err);
            return res.status(500).json({ error: 'Unknown error during file upload' });
        }
        next();
    });
}, async (req, res) => {
    const client = await db.connect();
    try {
        const employeeData = req.body;
        const files = req.files;

        console.log('Uploaded files:', files); // Debug log

        await client.query('BEGIN');

        const personalInfo = {
            full_name: employeeData.fullName,
            email: employeeData.email,
            phone_no: employeeData.phoneNo,
            alternate_number: employeeData.alternateNumber,
            guardian_name: employeeData.guardianName,
            guardian_contact: employeeData.guardianContact,
            marital_status: employeeData.maritalStatus,
            gender: employeeData.gender,
            blood_group: employeeData.bloodGroup,
            date_of_birth: employeeData.dateOfBirth
        };

        const empResult = await client.query(
            'INSERT INTO employees (full_name, email, phone_no, alternate_number, guardian_name, guardian_contact, marital_status, gender, blood_group, date_of_birth) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
            Object.values(personalInfo)
        );
        const employeeId = empResult.rows[0].id;

        const govIds = {
            employee_id: employeeId,
            aadhar_no: employeeData.aadharNo,
            aadhar_file: files['aadhaarFile'] ? files['aadhaarFile'][0].path : null,
            pan_no: employeeData.panNo,
            pan_file: files['panFile'] ? files['panFile'][0].path : null
        };
        await client.query(
            'INSERT INTO government_ids (employee_id, aadhar_no, aadhar_file, pan_no, pan_file) VALUES ($1, $2, $3, $4, $5)',
            Object.values(govIds)
        );

        const prevEmployment = {
            employee_id: employeeId,
            pf_no: employeeData.pfNo || null,
            uan_no: employeeData.uanNo || null
        };
        await client.query(
            'INSERT INTO previous_employment (employee_id, pf_no, uan_no) VALUES ($1, $2, $3)',
            Object.values(prevEmployment)
        );

        const address = {
            employee_id: employeeId,
            current_address: employeeData.currentAddress,
            current_city: employeeData.currentCity,
            current_state: employeeData.currentState,
            current_pincode: employeeData.currentPincode,
            permanent_address: employeeData.permanentAddress,
            permanent_city: employeeData.permanentCity,
            permanent_state: employeeData.permanentState,
            permanent_pincode: employeeData.permanentPincode
        };
        await client.query(
            'INSERT INTO addresses (employee_id, current_address, current_city, current_state, current_pincode, permanent_address, permanent_city, permanent_state, permanent_pincode) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            Object.values(address)
        );

        const bankDetails = {
            employee_id: employeeId,
            bank_name: employeeData.bankNameAsPerForm,
            account_no: employeeData.accountNo,
            ifsc_code: employeeData.ifscCode,
            branch_name: employeeData.branchName
        };
        await client.query(
            'INSERT INTO bank_details (employee_id, bank_name, account_no, ifsc_code, branch_name) VALUES ($1, $2, $3, $4, $5)',
            Object.values(bankDetails)
        );

        const educationDetails = JSON.parse(employeeData.educationDetails);
        const educationFiles = files['educationDocs'] || [];
        for (let i = 0; i < educationDetails.length; i++) {
            const edu = educationDetails[i];
            const eduData = {
                employee_id: employeeId,
                level: edu.level,
                stream: edu.stream,
                institution: edu.institution,
                year: edu.year,
                score: edu.score,
                doc_path: educationFiles[i] ? educationFiles[i].path : null
            };
            await client.query(
                'INSERT INTO education (employee_id, level, stream, institution, year, score, doc_path) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                Object.values(eduData)
            );
        }

        const employmentDetails = JSON.parse(employeeData.employmentDetails);
        const employmentFiles = files['employmentDocs'] || [];
        for (let i = 0; i < employmentDetails.length; i++) {
            const emp = employmentDetails[i];
            const empData = {
                employee_id: employeeId,
                company_name: emp.companyName,
                designation: emp.designation,
                last_project: emp.lastProject,
                start_date: emp.companyStartDate,
                end_date: emp.companyEndDate,
                doc_path: employmentFiles[i] ? employmentFiles[i].path : null
            };
            await client.query(
                'INSERT INTO employment_history (employee_id, company_name, designation, last_project, start_date, end_date, doc_path) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                Object.values(empData)
            );
        }

        const signatureData = {
            employee_id: employeeId,
            signature_file: files['signatureFile'] ? files['signatureFile'][0].path : null,
            consent: employeeData.consentCheckbox === 'on' ? true : false
        };
        await client.query(
            'INSERT INTO signatures (employee_id, signature_file, consent) VALUES ($1, $2, $3)',
            Object.values(signatureData)
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Form submitted successfully', employeeId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Error submitting form' });
    } finally {
        client.release();
    }
});

// GET endpoint to fetch all employees
app.get('/api/employees', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                e.id, e.full_name, e.email, e.phone_no, e.alternate_number, e.guardian_name, 
                e.guardian_contact, e.marital_status, e.gender, e.blood_group, e.date_of_birth,
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
            aadharNo: employee.aadhar_no,
            aadharFile: employee.aadhar_file ? `/uploads/${path.basename(employee.aadhar_file)}` : null,
            panNo: employee.pan_no,
            panFile: employee.pan_file ? `/uploads/${path.basename(employee.pan_file)}` : null,
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
            signature: employee.signature_file ? `/uploads/${path.basename(employee.signature_file)}` : null,
            consent: employee.consent,
            status: employee.status || 'pending'
        }));

        const [educationResult, employmentResult] = await Promise.all([
            db.query('SELECT * FROM education'),
            db.query('SELECT * FROM employment_history')
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
                    doc: edu.doc_path ? `/uploads/${path.basename(edu.doc_path)}` : null
                }));

            employee.employmentDetails = employmentResult.rows
                .filter(emp => emp.employee_id === employee.id)
                .map(emp => ({
                    companyName: emp.company_name,
                    designation: emp.designation,
                    lastProject: emp.last_project,
                    companyStartDate: emp.start_date,
                    companyEndDate: emp.end_date,
                    doc: emp.doc_path ? `/uploads/${path.basename(emp.doc_path)}` : null
                }));
        });

        res.json(employees);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database query error' });
    }
});

// PUT endpoint to update employee status
app.put('/api/employees/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await db.query(
            'UPDATE signatures SET status = $1 WHERE employee_id = $2',
            [status, id]
        );
        res.json({ message: 'Status updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error updating status' });
    }
});

// DELETE endpoint to clear all employees
app.delete('/api/employees', async (req, res) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        
        const tables = ['signatures', 'employment_history', 'education', 'bank_details', 'addresses', 'previous_employment', 'government_ids', 'employees'];
        for (const table of tables) {
            await client.query(`DELETE FROM ${table}`);
        }
        
        await client.query('COMMIT');
        res.json({ message: 'All records cleared successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Error clearing records' });
    } finally {
        client.release();
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});