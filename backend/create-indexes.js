const mysql = require('mysql2');
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'gestion_stages'
});

connection.connect((err) => {
  if (err) {
    console.error('DB Error:', err.message);
    process.exit(1);
  }
  
  console.log('[DB] Creating indexes for performance optimization...');
  
  // Index on residents.cin
  connection.query('ALTER TABLE residents ADD INDEX idx_residents_cin (cin)', (err) => {
    if (err && err.message.includes('Duplicate key')) {
      console.log('[DB] Index idx_residents_cin already exists');
    } else if (err) {
      console.error('[DB] Error creating index on residents.cin:', err.message);
    } else {
      console.log('[DB] Index idx_residents_cin created');
    }
  });
  
  // Index on formulaires_stage.resident_id
  connection.query('ALTER TABLE formulaires_stage ADD INDEX idx_formulaires_resident_id (resident_id)', (err) => {
    if (err && err.message.includes('Duplicate key')) {
      console.log('[DB] Index idx_formulaires_resident_id already exists');
    } else if (err) {
      console.error('[DB] Error creating index on formulaires_stage.resident_id:', err.message);
    } else {
      console.log('[DB] Index idx_formulaires_resident_id created');
    }
  });
  
  // Verify indexes
  setTimeout(() => {
    connection.query('SHOW INDEX FROM residents', (err, results) => {
      if (results) {
        const hasIndex = results.some(row => row.Key_name === 'idx_residents_cin');
        console.log('[DB] residents.cin index:', hasIndex ? '✓ exists' : '✗ missing');
      }
    });
    
    connection.query('SHOW INDEX FROM formulaires_stage', (err, results) => {
      if (results) {
        const hasIndex = results.some(row => row.Key_name === 'idx_formulaires_resident_id');
        console.log('[DB] formulaires_stage.resident_id index:', hasIndex ? '✓ exists' : '✗ missing');
      }
      connection.end(() => {
        console.log('[DB] Indexes optimization complete');
      });
    });
  }, 500);
});
