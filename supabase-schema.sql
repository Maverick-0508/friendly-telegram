-- ==========================================================
-- Lawn Craft Supabase Database Schema
-- Run this in your Supabase SQL Editor:
-- https://tguievntviuanworgcqc.supabase.co
-- ==========================================================

-- 1. Leads Table (Contact Consultations)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT,
    source TEXT DEFAULT 'website',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts from the website
CREATE POLICY "Allow anonymous lead creation"
    ON public.leads
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Allow authenticated service role to read/manage leads
CREATE POLICY "Allow service role full access to leads"
    ON public.leads
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Quotes Table (Instant Pricing & Estimates)
CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    address TEXT,
    property_size NUMERIC,
    property_type TEXT,
    service_type TEXT,
    service_frequency TEXT,
    preferred_start_date DATE,
    additional_details TEXT,
    status TEXT DEFAULT 'pending_review',
    total_amount NUMERIC DEFAULT 65.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Allow anonymous quote submissions
CREATE POLICY "Allow anonymous quote creation"
    ON public.quotes
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Allow authenticated service role full access to quotes
CREATE POLICY "Allow service role full access to quotes"
    ON public.quotes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. Work Orders Table (Scheduled Jobs & Dispatch)
CREATE TABLE IF NOT EXISTS public.work_orders (
    id TEXT PRIMARY KEY,
    client_id TEXT,
    client_name TEXT NOT NULL,
    client_phone TEXT NOT NULL,
    client_email TEXT,
    title TEXT NOT NULL,
    service_type TEXT NOT NULL,
    status TEXT DEFAULT 'incoming',
    scheduled_date TEXT,
    total_price NUMERIC,
    property_size NUMERIC,
    address TEXT,
    invoice_id TEXT,
    notes TEXT,
    crew_name TEXT DEFAULT 'Pending Supervisor Dispatch',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous work order creation"
    ON public.work_orders
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "Allow service role full access to work orders"
    ON public.work_orders
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
