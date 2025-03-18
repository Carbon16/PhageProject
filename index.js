const express = require('express');
const mariadb = require('mariadb');
const cors = require('cors');
const app = express();
const port = 8080;
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

// ********************************************************************************************************************
// SETUP

// get config vars
dotenv.config();

// access config var
process.env.TOKEN_SECRET;

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: 'http://localhost:8080', // Replace with your frontend's origin
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'auth']
}));

const pool = mariadb.createPool({
    host: 'localhost',
    user: 'root',
    password: 'Tritium1769',
    database: 'phage',
    connectionLimit: 10
});

function generateAccessToken(payload) {
    return jwt.sign(payload, process.env.TOKEN_SECRET, { expiresIn: '2592000s' });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['auth'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.TOKEN_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);

        req.user = user;
        req.userType = user.type; // Add user type to the request object
        next();
    });
};

function authenticateParams(token) {
    try {
        const user = jwt.verify(token, process.env.TOKEN_SECRET);
        if (user && user.type) {
            return user.type; // Return the user's type if valid
        }
        return false;
    } catch (err) {
        return false; // Return false if token is invalid
    }
};



// ********************************************************************************************************************
// ROUTES

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/html/index.html');
});

app.get('/register', (req, res) => {
    res.sendFile(__dirname + '/html/register.html');
});

app.get('/styles.css', (req, res) => {
    res.sendFile(__dirname + '/styles.css');
});

// If there is a request to /images, send the image file
app.get('/images/:name', (req, res) => {
    res.sendFile(__dirname + '/images/' + req.params.name);
});

// Handle user registration
app.post('/register', (req, res) => {
    const { name, email, password } = req.body; // Access data from the request body

    if (!name || !email || !password) {
        res.status(400).send('Missing required fields');
        return;
    }

    pool.getConnection()
    .then(conn => {
        console.log('Database connection successful');
        conn.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, password])
            .then(result => {
                res.sendStatus(201); // Successfully created
                conn.end();
            })
            .catch(error => {
                console.error('Error executing query:', error);
                res.status(500).send('Error registering user');
                conn.end();
            });
    })
    .catch(error => {
        console.error('Error connecting to database:', error);
        res.status(500).send('Error connecting to database');
    });
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/html/login.html');
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).send('Missing required fields');
        return;
    }

    pool.getConnection()
    .then(conn => {
        console.log('Database connection successful');
        conn.query("SELECT * FROM users WHERE email = ? AND password = ?", [email, password])
            .then(result => {
                if (result.length === 0) {
                    res.status(401).send('Invalid email or password');
                } else {
                    const user = result[0];
                    const token = generateAccessToken({ id: user.userID, type: user.type });
                    res.status(200).json({ token });
                }
                conn.end();
            })
            .catch(error => {
                console.error('Error executing query:', error);
                res.status(500).send('Error logging in');
                conn.end();
            });
    })
    .catch(error => {
        console.error('Error connecting to database:', error);
        res.status(500).send('Error connecting to database');
    });
});

app.get('/dashboard/:token', (req, res) => {
    const userType = authenticateParams(req.params.token);
    if (userType === ('A' || 'R')) {
        res.sendFile(__dirname + '/html/admin.html');
    } else if (userType === ('U' || 'V')) {
        res.sendFile(__dirname + '/html/dashboard.html');
    } else {
        res.status(403).send('Invalid token');
    };
});

app.post('/order', authenticateToken, (req, res) => {
    const { address, country } = req.body; // Extract address and country from the request body
    const userId = req.user.id; // Extract the user ID from the authenticated token

    if (userId) {
        pool.getConnection()
            .then(conn => {
                console.log('Database connection successful');
                const cleared = country !== 'United Kingdom' ? 1 : 0; // Determine if the order is international

                // Insert the order into the database
                conn.query(
                    "INSERT INTO orders (orderedBy, address, country, cleared) VALUES (?, ?, ?, ?)",
                    [userId, address, country, cleared]
                )
                    .then(result => {
                        res.sendStatus(201); // Successfully created
                        conn.end();
                    })
                    .catch(error => {
                        console.error('Error executing query:', error);
                        res.status(500).send('Error placing order');
                        conn.end();
                    });
            })
            .catch(error => {
                console.error('Error connecting to database:', error);
                res.status(500).send('Error connecting to database');
            });
    } else {
        res.status(403).send('Invalid token');
    }
});

app.get('/orders/:token', (req, res) => {
    const userType = authenticateParams(req.params.token);
    if (userType === ('U' || 'V')) {
        res.sendFile(__dirname + '/html/prev_ord.html');
    } else {
        res.status(403).send('Invalid token');
    };
});

app.get('/order/byUser', authenticateToken, async (req, res) => {
    console.log('Retrieving orders for user');
    console.log('Authenticated user:', req.user); // Log the authenticated user

    const userId = req.user.id; // Extract the user ID from the authenticated token
    if (userId) {
        try {
            const conn = await pool.getConnection();
            console.log('Database connection successful');

            // Fetch all orders for the user, including the status field
            const orders = await conn.query("SELECT * FROM orders WHERE orderedBy = ?", [userId]);

            res.status(200).json(orders); // Send the orders directly
            conn.end();
        } catch (error) {
            console.error('Error retrieving orders:', error);
            res.status(500).send('Error retrieving orders');
        }
    } else {
        console.error('User ID not found in token');
        res.status(403).send('Invalid token');
    }
});

 // Save the details of the order
app.post('/order/detailEntry/:id', authenticateToken, (req, res) => {
    const orderID = req.params.id; // Extract the order ID from the URL parameter
    const { dateOfCollection, locationDescription, locationCoordinates, comments } = req.body; // Extract data from the request body

    if (!dateOfCollection || !locationDescription || !locationCoordinates) {
        res.status(400).send('Missing required fields');
        return;
    }

    pool.getConnection()
        .then(conn => {
            console.log('Database connection successful');

            // Update the order in the database
            conn.query(
                "UPDATE orders SET dateCollected = ?, locationDescription = ?, locationCoordinates = ?, comments = ?, status = 'collected' WHERE requestID = ?",
                [dateOfCollection, locationDescription, locationCoordinates, comments, orderID]
            )
                .then(result => {
                    if (result.affectedRows > 0) {
                        res.status(201)
                    } else {
                        res.status(404).send('Order not found');
                    }
                    conn.end();
                })
                .catch(error => {
                    console.error('Error executing query:', error);
                    res.status(500).send('Error updating order details');
                    conn.end();
                });
        })
        .catch(error => {
            console.error('Error connecting to database:', error);
            res.status(500).send('Error connecting to database');
        });
});

app.get('/orders', authenticateToken, (req, res) => {
    const userType = req.userType;
    if (userType === 'A' || userType === 'R') {
        // Get all orders from the database
        pool.getConnection()
            .then(conn => {
                console.log('Database connection successful');
                conn.query("SELECT * FROM orders") // Fetch all orders, including the status field
                    .then(orders => {
                        res.status(200).json(orders); // Send the orders directly
                        conn.end();
                    })
                    .catch(error => {
                        console.error('Error executing query:', error);
                        res.status(500).send('Error retrieving orders');
                        conn.end();
                    });
            })
            .catch(error => {
                console.error('Error connecting to database:', error);
                res.status(500).send('Error connecting to database');
            });
    } else {
        res.status(403).send('Invalid token');
    }
});

app.patch('/set/status/:id', authenticateToken, (req, res) => {
    const userType = req.userType;
    if (userType === 'A' || userType === 'R') {
        const orderID = req.params.id; // Extract the order ID from the URL parameter
        const { status } = req.body; // Extract the status from the request body

        if (!status) {
            res.status(400).send('Missing required fields');
            return;
        }

        pool.getConnection()
            .then(conn => {
                console.log('Database connection successful');

                // Update the order in the database
                conn.query(
                    "UPDATE orders SET status = ? WHERE requestID = ?",
                    [status, orderID]
                )
                    .then(result => {
                        if (result.affectedRows > 0) {
                            res.sendStatus(204);
                        } else {
                            res.status(404).send('Order not found');
                        }
                        conn.end();
                    })
                    .catch(error => {
                        console.error('Error executing query:', error);
                        res.status(500).send('Error updating order status');
                        conn.end();
                    });
            })
            .catch(error => {
                console.error('Error connecting to database:', error);
                res.status(500).send('Error connecting to database');
            });
    } else {
        res.status(403).send('Invalid token');
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});