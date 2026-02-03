const mysql = require('mysql2/promise');

async function fixSmtpTypo() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: 'digitaltp'
    });
    
    const [result] = await conn.execute(
        "UPDATE institutions SET smtp_host = 'smtp.titan.email' WHERE smtp_host = 'mtp.titan.email'"
    );
    
    console.log('Fixed SMTP host typo. Updated rows:', result.affectedRows);
    await conn.end();
}

fixSmtpTypo().catch(console.error);
