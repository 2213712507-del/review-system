import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://brqiryhudyopxarhfbgd.supabase.co';
const supabaseAnonKey = 'sb_publishable_5A5J4K_7surYTf6P_iQ0MQ_YkpRGbRs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
