# Supabase Email Confirmation Setup

## Goal
Require email confirmation before users can log in. Users can sign up, but must confirm their email before accessing the app.

## Solution
Configure Supabase to require email confirmation for sign-in:

1. **Go to Supabase Dashboard**
   - Log in at https://supabase.com/dashboard
   - Select your project: `arhoasurtfurjgfohlgt`

2. **Navigate to Authentication Settings**
   - Click on **Authentication** in the left sidebar
   - Click on **Providers** (or **Settings**)

3. **Configure Email Provider**
   - Find the **Email** provider section
   - **Enable** "Confirm Email" or "Enable email confirmations" (this sends confirmation emails)
   - **Enable** "Require email confirmation for sign in" (this blocks sign-in until email is confirmed)
   - Click **Save**

4. **Alternative: If using Auth Settings**
   - Go to **Authentication** → **Settings**
   - **Enable** "Enable email confirmations" (to send emails)
   - **Enable** "Require email confirmation for sign in" (to block login until confirmed)
   - Save changes

## How It Works

After this configuration:
- ✅ Users can **sign up** (account created)
- ✅ Confirmation email is **sent automatically**
- ✅ Users **cannot log in** until email is confirmed
- ✅ After clicking confirmation link, users can **log in**
- ✅ Once logged in, all features are **available**

## User Flow

1. User signs up → Account created, confirmation email sent
2. User sees message: "Please check your email to confirm your account"
3. User receives confirmation email
4. User clicks confirmation link → Email is confirmed
5. User can now log in → All features available
6. User can resend confirmation email from login page if needed

