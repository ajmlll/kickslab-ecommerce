const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user.model");

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            proxy: true,
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails[0].value;
                const profileImage = profile.photos[0]?.value;
                const name = profile.displayName;
                const googleId = profile.id;

                // Check if user exists
                let user = await User.findOne({ email });

                if (user) {
                    // If user exists but was created locally, we might want to link or just login
                    // According to requirements: "Check if the email already exists in the database. If the user does not exist: Create a new user..."
                    // "If the email already exists... Log the user in automatically."

                    if (!user.googleId) {
                        user.googleId = googleId;
                        user.authProvider = "google";
                        if (!user.profileImage) user.profileImage = profileImage;
                        user.isVerified = true; // Google emails are verified
                        await user.save();
                    }
                    return done(null, user);
                }

                // Create new user
                user = new User({
                    name,
                    email,
                    googleId,
                    profileImage,
                    authProvider: "google",
                    isVerified: true,
                });

                await user.save();
                done(null, user);
            } catch (err) {
                done(err, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;
