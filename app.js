// Install Command:
// npm init -y
// npm i express express-handlebars body-parser mongodb
// npm install express-session

// Run command:
// node app.js

const express = require('express');
const server = express();
const bodyParser = require('body-parser');
const handlebars = require('express-handlebars');
const session = require('express-session');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

// Middleware setup
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Setup sessions
server.use(session({
    secret: 'your_secret_key', // Replace with a strong secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to make session data available in templates
server.use((req, res, next) => {
    res.locals.isAuthenticated = req.session.isAuthenticated || false; // Check if the user is authenticated
    res.locals.username = req.session.username || ''; // Make the username available
    next();
});

// Set view engine and configure Handlebars
server.set('view engine', 'hbs');
server.engine('hbs', handlebars.engine({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts/', // Layouts directory
    defaultLayout: 'index', // Default layout
}));

// Serve static files from the "public" directory
server.use(express.static('public'));

// MongoDB setup
const databaseURL = "mongodb+srv://shanleyvalenzuela24:DtcDdw13cG8fiQeb@plazadelnorte.jiyev.mongodb.net/?retryWrites=true&w=majority&appName=PlazadelNorte";
const mongoClient = new MongoClient(databaseURL, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const databaseName = "hotelDB";
const adminCollection = "adminCollection";
const reservationCollection = "reservationCollection";
const roomCollection = "roomCollection";

// Admin Login Route
server.get('/', (req, res) => {
    res.render('admin-login', { layout: 'index', title: 'Admin Login' });
});

// Handle login attempts
server.post('/admin-login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt:', username); // Log the username

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(adminCollection);

        const admin = await collection.findOne({ username: username, password: password });

        if (admin) {
            req.session.isAuthenticated = true; // Set session variable for authentication
            req.session.username = username; // Store the username
            console.log('Login successful:', username); // Log success
            res.redirect('/admin-dashboard'); // Redirect to dashboard
        } else {
            console.log('Invalid credentials'); // Log invalid login
            res.render('admin-login', { layout: 'index', title: 'Admin Login', error: 'Invalid credentials' });
        }

    } catch (error) {
        console.error('Error during admin login:', error);
        res.status(500).send('Error during login');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

// Render the registration page
server.get('/admin/register', (req, res) => {
    res.render('admin-register', { layout: 'index', title: 'Register Admin' });
});

// Handle registration of new admin with email
server.post('/admin/register', async (req, res) => {
    const { email, username, password } = req.body;

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(adminCollection);

        const existingAdmin = await collection.findOne({ username: username });

        if (existingAdmin) {
            res.render('admin-register', { layout: 'index', title: 'Register Admin', error: 'Username already exists' });
            return;
        }

        const newAdmin = {
            email: email,
            username: username,
            password: password, // Store hashed passwords in production
        };

        await collection.insertOne(newAdmin);
        res.redirect('/'); // Redirect to login page after successful registration

    } catch (error) {
        console.error('Error during admin registration:', error);
        res.status(500).send('Error during registration');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

// Forgot Password Route
server.get('/admin/forgot-password', (req, res) => {
    res.render('admin-forgot-password', { layout: 'index', title: 'Forgot Password' });
});

// Handle Forgot Password
server.post('/admin/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(adminCollection);

        const admin = await collection.findOne({ email: email });

        if (!admin) {
            res.render('admin-forgot-password', { layout: 'index', title: 'Forgot Password', error: 'Email not found' });
            return;
        }

        // In production, send a reset link or instructions to the email
        res.send('Instructions to reset your password have been sent to your email.');

    } catch (error) {
        console.error('Error handling forgot password:', error);
        res.status(500).send('Error processing request');
    } finally {
        await mongoClient.close();
    }
});

// Admin Dashboard Route
server.get('/admin-dashboard', (req, res) => {
    if (!req.session.isAuthenticated) { // Check for isAuthenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }
    res.render('admin-dashboard', { layout: 'index', title: 'Admin Dashboard', username: req.session.username });
});

// Bookings Route
server.get('/admin-bookings', async (req, res) => {
    if (!req.session.isAuthenticated) { // Check for isAuthenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    const { startDate, endDate } = req.query;

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(reservationCollection);

        const query = {};

        // Build query based on filter inputs
        if (startDate) {
            query.checkIn = { $gte: new Date(startDate) };
        }
        if (endDate) {
            query.checkOut = { $lte: new Date(endDate) };
        }

        const bookings = await collection.find(query).toArray();
        res.render('admin-bookings', { layout: 'index', title: 'Bookings', bookings, username: req.session.username });

    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).send('Error fetching bookings');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});

// Route to display all room details
server.get('/admin-room-details', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(roomCollection);

        // Fetch all rooms
        const rooms = await collection.find({}).toArray(); // Get all room details

        res.render('admin-room-details', {
            layout: 'index',
            title: 'Room Details',
            rooms, // Pass rooms to the template
            username: req.session.username,
        });

    } catch (error) {
        console.error('Error fetching room details:', error);
        res.status(500).send('Error fetching room details');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
});


// Payments Route
server.get('/admin-payments', (req, res) => {
    if (!req.session.isAuthenticated) { // Check for isAuthenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }
    res.render('admin-payments', { layout: 'index', title: 'Payments', username: req.session.username });
});

// Admin Logout Route
server.get('/admin-logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out'); // Return error response
        }
        // Redirect to admin login page after logout
        res.redirect('/'); // Redirect after session is destroyed
    });
});

// Start server
const PORT = 3001; // Admin server on port 3001
server.listen(PORT, () => {
    console.log(`Admin server is running on port ${PORT}`);
});
