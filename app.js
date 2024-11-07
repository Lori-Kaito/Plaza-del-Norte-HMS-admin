// Install Command:
// npm init -y
// npm i express express-handlebars body-parser mongodb
// npm install express-session bcrypt handlebars-helpers

// Run command:
// node app.js

const express = require('express');
const server = express();
const bodyParser = require('body-parser');
const handlebars = require('express-handlebars');
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');
const helpers = require('handlebars-helpers');

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
    helpers: {
        eq: (a, b) => a === b
    }
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
// const paymentsCollection = "paymentsCollection"; // Collection for payments

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

        const admin = await collection.findOne({ username: username });

        if (admin) {
            // Compare the hashed password in the database with the plain text password entered by the user
            const isMatch = await bcrypt.compare(password, admin.password);
            if (isMatch) {
                req.session.isAuthenticated = true; // Set session variable for authentication
                req.session.username = username; // Store the username
                console.log('Login successful:', username); // Log success
                res.redirect('/admin-dashboard'); // Redirect to dashboard
            } else {
                console.log('Invalid credentials'); // Log invalid login
                res.render('admin-login', { layout: 'index', title: 'Admin Login', error: 'Invalid credentials' });
            }
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

        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newAdmin = {
            email: email,
            username: username,
            password: hashedPassword, // Store the hashed password
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

// Admin Payments Route with Filtering
server.get('/admin/payments', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    const { paymentStatus } = req.query; // Get the selected payment status from the query parameters

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(paymentsCollection); // Ensure this matches your database

        const query = {};

        // Filter payments based on the selected status
        if (paymentStatus) {
            query.status = paymentStatus;
        }

        const payments = await collection.find(query).toArray();

        res.render('admin-payment', {
            layout: 'index',
            title: 'Payments',
            payments,
            paymentStatus, // Maintain the selected payment status in the view
            username: req.session.username
        });

    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).send('Error fetching payments');
    } finally {
        await mongoClient.close();
    }
});

// Admin Dashboard Route with Reservations
server.get('/admin-dashboard', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(reservationCollection);

        // Fetch reservations (excluding total price)
        const reservations = await collection.find({}, {
            projection: { totalPrice: 0 }
        }).toArray();

        // Fetch room occupancy data by type
        const roomsCollection = db.collection(roomCollection);
        const roomTypes = ['Deluxe Queen', 'Deluxe Twin', 'Premiere', 'Dormitory'];
        const occupiedRoomsByType = {};
        const vacantRoomsByType = {};
        const notReadyRoomsByType = {};

        roomTypes.forEach(type => {
            occupiedRoomsByType[type] = 0;
            vacantRoomsByType[type] = 0;
            notReadyRoomsByType[type] = 0;
        });

        const rooms = await roomsCollection.find({}).toArray();
        rooms.forEach(room => {
            const type = room.roomType;
            const status = room.status;
            if (roomTypes.includes(type)) {
                if (status === 'Occupied') occupiedRoomsByType[type]++;
                else if (status === 'Vacant') vacantRoomsByType[type]++;
                else if (status === 'Not Ready') notReadyRoomsByType[type]++;
            }
        });

        // Calculate the total number of rooms
        const totalRooms = await roomsCollection.countDocuments();

        // Fetch total revenue for the current month
        const currentMonth = new Date();
        const firstDayOfCurrentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const lastDayOfCurrentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
        const currentMonthRevenue = await collection.aggregate([
            { $match: { checkIn: { $gte: firstDayOfCurrentMonth, $lte: lastDayOfCurrentMonth } } },
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]).toArray();
        const currentMonthTotal = currentMonthRevenue.length ? currentMonthRevenue[0].total : 0;

        // Fetch total revenue for the previous month
        const firstDayOfLastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        const lastDayOfLastMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0);
        const lastMonthRevenue = await collection.aggregate([
            { $match: { checkIn: { $gte: firstDayOfLastMonth, $lte: lastDayOfLastMonth } } },
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]).toArray();
        const lastMonthTotal = lastMonthRevenue.length ? lastMonthRevenue[0].total : 0;

        const revenueDifference = currentMonthTotal - lastMonthTotal;

        // Calculate total revenue for the current year
        const firstDayOfYear = new Date(currentMonth.getFullYear(), 0, 1);
        const lastDayOfYear = new Date(currentMonth.getFullYear(), 11, 31);
        const yearRevenue = await collection.aggregate([
            { $match: { checkIn: { $gte: firstDayOfYear, $lte: lastDayOfYear } } },
            { $group: { _id: null, total: { $sum: "$totalPrice" } } }
        ]).toArray();
        const totalYearRevenue = yearRevenue.length ? yearRevenue[0].total : 0;

        // Render data to the view
        res.render('admin-dashboard', {
            layout: 'index',
            title: 'Admin Dashboard',
            reservations,
            occupiedRoomsByType,
            vacantRoomsByType,
            notReadyRoomsByType,
            totalRooms, // Add total room count here
            currentMonthTotal,
            lastMonthTotal,
            revenueDifference,
            totalYearRevenue,
            username: req.session.username
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).send('Error fetching dashboard data');
    } finally {
        await mongoClient.close();
    }
});

// Admin Add Booking Route
server.get('/admin/add-booking', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }
    res.render('admin-add-booking', { layout: 'index', title: 'Add Booking', username: req.session.username });
});

// Handle Add Booking Form Submission
server.post('/admin/add-booking', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.redirect('/');
    }
    const bookingData = req.body; // Gather form data
    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection(reservationCollection);

        // Insert the new booking into the database
        await collection.insertOne(bookingData);
        res.redirect('/admin-bookings'); // Redirect to bookings list
    } catch (error) {
        console.error('Error adding booking:', error);
        res.status(500).send('Error adding booking');
    } finally {
        await mongoClient.close();
    }
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

// Booking Details Route
server.get('/admin-booking-details/:id', async (req, res) => {
    if (!req.session.isAuthenticated) { // Check if admin is authenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    const bookingId = req.params.id;

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const reservationCollection = db.collection('reservationCollection');
        const guestsCollection = db.collection('guestsCollection'); // Collection for guest information

        // Fetch the booking by its ID
        const booking = await reservationCollection.findOne({ _id: new ObjectId(bookingId) });

        if (booking) {
            // Fetch the guest's details based on the guestID from the booking
            const guest = await guestsCollection.findOne({ _id: new ObjectId(booking.guestID) });

            // Pass both booking and guest details to the template
            res.render('admin-booking-details', {
                layout: 'index',
                title: 'Booking Details',
                booking, // Pass booking details
                guest, // Pass guest details
                username: req.session.username
            });
        } else {
            // If no booking is found
            res.status(404).send('Booking not found');
        }

    } catch (error) {
        console.error('Error fetching booking details:', error);
        res.status(500).send('Error fetching booking details');
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

// Route to Payments
server.get('/admin-payments', async (req, res) => {
    if (!req.session.isAuthenticated) { // Check for isAuthenticated
        return res.redirect('/'); // Redirect to login if not authenticated
    }

    const { paymentStatus } = req.query; // Get the selected payment status from the query parameters

    try {
        await mongoClient.connect();
        const db = mongoClient.db(databaseName);
        const collection = db.collection('paymentsCollection'); // Replace with your actual payments collection

        const query = {};

        // If a payment status is selected, filter by that status
        if (paymentStatus) {
            query.status = paymentStatus;
        }

        // Fetch payments based on the filter (if any)
        const payments = await collection.find(query).toArray();

        // Render the payments page with the filtered data
        res.render('admin-payments', { layout: 'index', title: 'Payments', payments, username: req.session.username });

    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).send('Error fetching payments');
    } finally {
        await mongoClient.close(); // Ensure the connection is closed
    }
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
