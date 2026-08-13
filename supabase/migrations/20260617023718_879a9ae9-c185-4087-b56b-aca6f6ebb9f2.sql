CREATE POLICY "Admin can delete any note" ON public.notes
FOR DELETE TO authenticated
USING ((auth.jwt() ->> 'email') = 'admin@gmail.com');