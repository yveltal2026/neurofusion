-- Corrige el borrado de un proyecto que tiene baterías.
--
-- `battery_steps.study_id` era ON DELETE RESTRICT (inmediato). Al borrar un proyecto, Postgres borra
-- en cascada sus estudios y sus baterías, y el orden entre ambas cascadas no está garantizado: si los
-- estudios van primero, la llave inmediata los ve todavía referenciados por los pasos y aborta, así que
-- el proyecto no se podía borrar.
--
-- La llave pasa a DIFERIDA: se comprueba al cerrar la transacción, cuando los pasos ya se borraron con
-- su batería. Se conserva la protección: borrar directamente un estudio que es paso de una batería sigue
-- fallando (la app además lo avisa antes con `blocked=battery`).
-- NO ACTION (el valor por defecto) es lo que permite diferir; RESTRICT no se puede diferir.

alter table public.battery_steps drop constraint battery_steps_study_id_fkey;
alter table public.battery_steps
  add constraint battery_steps_study_id_fkey
  foreign key (study_id) references public.studies (id)
  deferrable initially deferred;
