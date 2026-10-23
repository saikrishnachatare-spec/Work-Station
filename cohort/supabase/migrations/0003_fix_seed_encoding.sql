-- Repair seed rows whose multi-byte characters were mangled during the first import.
update public.jobs set pay = '₹8,000/month' where firm = 'Sen & Rao LLP';
update public.jobs set pay = '₹7,500/month' where firm = 'Mehta & Associates';
update public.jobs set pay = '₹15,000/month' where firm = 'Amber Textiles Ltd';
update public.jobs set pay = '₹6,000/month' where firm = 'Sunny & Co.';
update public.jobs set pay = '₹4.2 LPA' where firm = 'VedaTax Advisors';
update public.jobs set pay = '₹3.6 LPA' where firm = 'Deccan Pharma';

update public.resources set meta = replace(meta, 'Â·', '·');
