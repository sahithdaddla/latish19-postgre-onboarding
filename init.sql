CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone_no VARCHAR(15) NOT NULL,
    alternate_number VARCHAR(15),
    guardian_name VARCHAR(255),
    guardian_contact VARCHAR(15),
    marital_status VARCHAR(50) NOT NULL,
    gender VARCHAR(50) NOT NULL,
    blood_group VARCHAR(10) NOT NULL,
    date_of_birth DATE NOT NULL,
    employment_status VARCHAR(50) NOT NULL DEFAULT 'fresher'
);

CREATE TABLE government_ids (
    employee_id INTEGER REFERENCES employees(id),
    aadhar_no VARCHAR(12) NOT NULL,
    aadhar_file VARCHAR(255),
    pan_no VARCHAR(10) NOT NULL,
    pan_file VARCHAR(255)
);

CREATE TABLE previous_employment (
    employee_id INTEGER REFERENCES employees(id),
    pf_no VARCHAR(50),
    uan_no VARCHAR(12)
);

CREATE TABLE addresses (
    employee_id INTEGER REFERENCES employees(id),
    current_address TEXT NOT NULL,
    current_city VARCHAR(50) NOT NULL,
    current_state VARCHAR(50) NOT NULL,
    current_pincode VARCHAR(10) NOT NULL,
    permanent_address TEXT NOT NULL,
    permanent_city VARCHAR(50) NOT NULL,
    permanent_state VARCHAR(50) NOT NULL,
    permanent_pincode VARCHAR(10) NOT NULL
);

CREATE TABLE bank_details (
    employee_id INTEGER REFERENCES employees(id),
    bank_name VARCHAR(255) NOT NULL,
    account_no VARCHAR(50) NOT NULL,
    ifsc_code VARCHAR(11) NOT NULL,
    branch_name VARCHAR(255) NOT NULL
);

CREATE TABLE education (
    employee_id INTEGER REFERENCES employees(id),
    level VARCHAR(50) NOT NULL,
    stream VARCHAR(255) NOT NULL,
    institution VARCHAR(255) NOT NULL,
    year VARCHAR(4) NOT NULL,
    score VARCHAR(10) NOT NULL,
    doc_path VARCHAR(255)
);

CREATE TABLE employment_history (
    employee_id INTEGER REFERENCES employees(id),
    company_name VARCHAR(255),
    designation VARCHAR(255),
    last_project VARCHAR(255),
    start_date DATE,
    end_date DATE,
    doc_path VARCHAR(255),
    department VARCHAR(100)
);

CREATE TABLE signatures (
    employee_id INTEGER REFERENCES employees(id),
    signature_file VARCHAR(255),
    consent BOOLEAN NOT NULL,
    status VARCHAR(20) DEFAULT 'pending'
);