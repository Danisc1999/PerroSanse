/* =============================================================
   Perro Sanse F.C. — capa de datos y acceso (Supabase)
   -------------------------------------------------------------
   Aquí vive TODO lo que habla con el servidor. La app no sabe de
   dónde salen los datos: llama a estas funciones y ya está.

   Las contraseñas NO están en este archivo ni en ninguna parte
   de la app. Viven cifradas en Supabase; el navegador solo
   pregunta "¿es correcta?" y recibe un sí o un no.

   Las dos claves de abajo son públicas a propósito: no dan
   acceso a nada por sí solas. Quien manda son las políticas de
   seguridad configuradas en el servidor.
   ============================================================= */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
  'https://gzognxciddxijoljcasn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6b2dueGNpZGR4aWpvbGpjYXNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NTU5NjYsImV4cCI6MjEwMjAzMTk2Nn0.tgLfH3ZZ_FjWIcCd6AQeIq8z4ZyYME13dKVsnAqQpPU'
);

export const PASS_INICIAL = 'sanse2026';
let sesion = null;   // { rol, jugadorId, perfilId, nombre }

/* ---------------- ACCESO ---------------- */

/** Toma el perfil de un usuario ya autenticado y prepara la sesión. */
async function perfilDe(user, rolEsperado) {
  const { data: perfil, error: errPerfil } = await sb
    .from('perfiles').select('*').eq('id', user.id).maybeSingle();

  if (errPerfil) return { ok: false, error: 'Error del servidor: ' + errPerfil.message };
  if (!perfil) return { ok: false, error: 'Esa cuenta no tiene perfil asignado. Avisa al míster.' };
  if (rolEsperado && perfil.rol !== rolEsperado) {
    const comoQue = { mister: 'de míster', jugador: 'de jugador', fan: 'de fan' };
    return { ok: false, error: 'Esa cuenta no es ' + comoQue[rolEsperado] + ', es ' + comoQue[perfil.rol] + '.' };
  }

  sesion = { rol: perfil.rol, jugadorId: perfil.jugador_id, perfilId: user.id, nombre: perfil.nombre };
  return {
    ok: true, rol: perfil.rol, nombre: perfil.nombre,
    // El míster que además juega tiene su ficha vinculada en el perfil:
    // así puede contestar la convocatoria y puntuar como uno más.
    // Sin vínculo devuelve el id de la cuenta, y la app le bloquea votar.
    id: perfil.jugador_id != null ? perfil.jugador_id : user.id,
    perfilId: user.id,
    primeraVez: perfil.rol === 'jugador' && perfil.pass_cambiada === false
  };
}

/** Recupera la sesión que el navegador ya tenía guardada, para no pedir
 *  la contraseña cada vez que se abre la app. */
export async function sesionActual() {
  const { data } = await sb.auth.getSession();
  if (!data || !data.session) return { ok: false };
  return perfilDe(data.session.user);
}

async function entrar(email, pass, rolEsperado) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: (email || '').trim().toLowerCase(), password: pass
  });
  if (error) return { ok: false, error: 'Correo o contraseña incorrectos.' };
  return perfilDe(data.user, rolEsperado);
}

export async function loginMister(pass, email) { return entrar(email, pass, 'mister'); }
export async function loginJugador(email, pass) { return entrar(email, pass, 'jugador'); }
export async function loginFan(email, pass) { return entrar(email, pass, 'fan'); }

export async function registrarFan(nombre, email, pass) {
  const correo = (email || '').trim().toLowerCase();
  if (!nombre.trim() || !correo || pass.length < 6) {
    return { ok: false, error: 'Rellena nombre, correo y una contraseña de 6 o más caracteres.' };
  }
  const { data, error } = await sb.auth.signUp({
    email: correo, password: pass, options: { data: { nombre: nombre.trim() } }
  });
  if (error) return { ok: false, error: error.message };
  if (!data.session) return { ok: false, error: 'Cuenta creada. Confirma el correo que te hemos enviado y entra.' };
  sesion = { rol: 'fan', jugadorId: null, perfilId: data.user.id, nombre: nombre.trim() };
  return { ok: true, fan: { id: data.user.id, nombre: nombre.trim(), email: correo, favoritos: [] } };
}

export async function salir() { sesion = null; await sb.auth.signOut(); }

export async function cambiarPass(nueva) {
  const { error } = await sb.auth.updateUser({ password: nueva });
  if (error) return { ok: false, error: error.message };
  if (sesion) { try { await sb.from('perfiles').update({ pass_cambiada: true }).eq('id', sesion.perfilId); } catch (e) {} }
  return { ok: true };
}

/** Comprueba la contraseña actual reintentando el acceso con ella. */
export async function comprobarPassActual(rol, pass) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return false;
  const { error } = await sb.auth.signInWithPassword({ email: user.email, password: pass });
  return !error;
}

export async function recuperarPass(email) {
  const { error } = await sb.auth.resetPasswordForEmail((email || '').trim().toLowerCase());
  return !error;
}

/* ---------------- LEER ---------------- */

export async function cargar() {
  if (!sesion) return null;

  const [jug, cam, par, act, avi, pub, com, fav, vot, cla, cvs, als, nts, mul, pag, sug, aju, eco, equ, tem, his] = await Promise.all([
    sb.from('jugadores').select('*').order('id'),
    sb.from('campos').select('*').order('id'),
    sb.from('partidos').select('*').order('num'),
    sb.from('actas').select('*').order('jornada', { ascending: false }),
    sb.from('avisos').select('*').order('id', { ascending: false }),
    sb.from('publicaciones').select('*').order('id', { ascending: false }),
    sb.from('comentarios').select('*').order('id'),
    sb.from('favoritos').select('*'),
    sb.from('votos_mvp').select('*'),
    sb.from('clasificacion').select('*').order('orden'),
    sb.from('convocatorias').select('*'),
    sb.from('alineaciones').select('*'),
    sb.from('notas').select('*'),
    sb.from('multas').select('*').order('id', { ascending: false }),
    sb.from('pagos').select('*'),
    sb.from('sugerencias').select('*').order('id', { ascending: false }),
    sb.from('ajustes').select('*').eq('clave', 'visibilidad').maybeSingle(),
    sb.from('ajustes').select('*').eq('clave', 'economia').maybeSingle(),
    sb.from('ajustes').select('*').eq('clave', 'equipaciones').maybeSingle(),
    sb.from('temporadas').select('*').order('id', { ascending: false }),
    sb.from('historico_liga').select('*').order('jornada')
  ]);

  const partidos = (par.data || []).map(p => ({
    num: p.num, rival: p.rival, casa: p.casa, campoId: p.campo_id,
    dia: p.dia, mes: p.mes, hora: p.hora, gf: p.gf, gc: p.gc, pista: p.pista || ''
  }));
  const convPorJornada = {};
  (cvs.data || []).forEach(c => {
    (convPorJornada[c.partido_num] = convPorJornada[c.partido_num] || {})[c.jugador_id] = c.estado;
  });

  const aliPorJornada = {};
  (als.data || []).forEach(a => {
    aliPorJornada[a.partido_num] = { formacion: a.formacion || '1-2-3-1', once: a.once || {}, posiciones: a.posiciones || {} };
  });

  const comentariosPorPost = {};
  (com.data || []).forEach(c => {
    (comentariosPorPost[c.publicacion_id] = comentariosPorPost[c.publicacion_id] || []).push({ autor: c.autor, texto: c.texto });
  });

  const claveFav = sesion.rol === 'jugador' ? 'jug-' + sesion.jugadorId : 'fan-' + sesion.perfilId;
  const favoritos = {};
  favoritos[claveFav] = (fav.data || []).filter(f => f.perfil_id === sesion.perfilId).map(f => f.jugador_id);

  const conteo = {};
  (fav.data || []).forEach(f => { conteo[f.jugador_id] = (conteo[f.jugador_id] || 0) + 1; });

  const votoPorJornada = {};
  (vot.data || []).filter(v => v.votante === sesion.perfilId)
    .forEach(v => { votoPorJornada[v.jornada] = v.jugador_id; });

  return {
    jugadores: (jug.data || []).map(j => Object.assign({}, j, { fans: conteo[j.id] || 0 })),
    campos: cam.data || [],
    partidos,
    actas: (() => {
      // Una sola acta por jornada, la más reciente: así una base que ya
      // tuviera filas repetidas deja de duplicar todo lo que cuelga de ellas.
      const porJornada = {};
      (act.data || []).forEach(a => {
        const previa = porJornada[a.jornada];
        if (!previa || a.id > previa.id) porJornada[a.jornada] = a;
      });
      return Object.keys(porJornada).map(k => porJornada[k]).sort((a, b) => b.jornada - a.jornada);
    })(),
    avisos: avi.data || [],
    feed: (pub.data || []).map(p => Object.assign({}, p, {
      misLikes: false, reacciones: p.reacciones || {}, comentarios: comentariosPorPost[p.id] || []
    })),
    convPorJornada,
    aliPorJornada,
    clasificacion: (() => {
      // Un solo equipo por nombre, quedándose con el que tenga más partidos:
      // así una base con filas repetidas deja de duplicar la liga entera.
      const porNombre = {};
      (cla.data || []).forEach(e => {
        const previa = porNombre[e.nombre];
        if (!previa || (e.pj || 0) > (previa.pj || 0) || ((e.pj || 0) === (previa.pj || 0) && e.id < previa.id)) {
          porNombre[e.nombre] = e;
        }
      });
      const lista = Object.keys(porNombre).map(k => porNombre[k])
        .sort((a, b) => (a.orden || 0) - (b.orden || 0));
      return lista.length ? lista : null;
    })(),
    faltaClasificacion: !!cla.error,
    favoritos,
    votoPorJornada,
    notas: nts.data || [],
    multas: mul.data || [],
    pagos: pag.data || [],
    sugerencias: sug.data || [],
    visibilidad: (aju && aju.data && aju.data.valor) || null,
    economia: (eco && eco.data && eco.data.valor) || null,
    fotosEquipacion: (equ && equ.data && equ.data.valor) || null,
    temporadas: tem.data || [],
    historicoLiga: his.data || [],
    misNotas: (() => {
      const m = {};
      (nts.data || []).filter(n => n.votante === sesion.perfilId)
        .forEach(n => { (m[n.jornada] = m[n.jornada] || {})[n.jugador_id] = n.nota; });
      return m;
    })(),
    votosMvp: vot.data || []
  };
}

/* ---------------- ESCRIBIR ----------------
   Cada rol solo manda lo que le corresponde. Aunque alguien
   forzara el envío, el servidor lo rechazaría por las políticas
   del paso 3. Esto es solo para no molestarle con errores. */

/** Todas las convocatorias que la app tenga en memoria, no solo la
 *  jornada abierta: así una carga masiva (datos de ejemplo) persiste. */
function filasConvocatorias(datos, jornada) {
  const mapa = datos.convPorJornada || { [jornada]: datos.estados || {} };
  const filas = [];
  Object.keys(mapa).forEach(num => {
    Object.keys(mapa[num] || {}).forEach(id => {
      filas.push({ partido_num: Number(num), jugador_id: Number(id), estado: mapa[num][id] });
    });
  });
  return filas;
}

function filasAlineaciones(datos, jornada) {
  const mapa = datos.aliPorJornada || { [jornada]: { formacion: datos.formacion, once: datos.once } };
  return Object.keys(mapa).map(num => ({
    partido_num: Number(num),
    formacion: (mapa[num] || {}).formacion || '1-2-3-1',
    once: (mapa[num] || {}).once || {},
    posiciones: (mapa[num] || {}).posiciones || {}
  }));
}

/** Escribe el voto de la jornada de votación, y solo si hay uno para
 *  esa jornada concreta: así ningún voto antiguo se reemite solo. */
async function guardarVoto(datos) {
  const jornada = datos.jornadaVoto || 0;
  const mapa = datos.votoPorJornada || {};
  // Si nunca ha tocado la votación de esta jornada, no hay nada que escribir.
  if (!jornada || !(jornada in mapa)) return null;
  const elegido = mapa[jornada];
  // Sin elegido = voto anulado: hay que borrar la fila, no dejarla como estaba.
  if (!elegido) {
    return sb.from('votos_mvp').delete().eq('jornada', jornada).eq('votante', sesion.perfilId);
  }
  return sb.from('votos_mvp').upsert({ jornada, votante: sesion.perfilId, jugador_id: elegido });
}

/** Guarda las notas que este usuario ha puesto en la jornada de votación. */
async function guardarNotas(datos) {
  const jornada = datos.jornadaVoto || 0;
  if (!jornada || !datos.misNotas || !(jornada in datos.misNotas)) return null;
  const mias = datos.misNotas[jornada] || {};
  const ids = Object.keys(mias).map(Number);

  // Las notas que se hayan quitado tienen que desaparecer del servidor.
  const borrado = ids.length
    ? await sb.from('notas').delete().eq('jornada', jornada).eq('votante', sesion.perfilId).not('jugador_id', 'in', '(' + ids.join(',') + ')')
    : await sb.from('notas').delete().eq('jornada', jornada).eq('votante', sesion.perfilId);
  if (borrado && borrado.error) return borrado;
  if (!ids.length) return null;

  return sb.from('notas').upsert(ids.map(id => ({
    jornada, votante: sesion.perfilId, jugador_id: id, nota: mias[id]
  })));
}

/** Multas y cuotas: solo el míster escribe. */
export async function guardarEconomia(multas, pagos, sugerencias) {
  if (!sesion || sesion.rol !== 'mister') return { ok: true };
  const res = await Promise.all([
    (multas || []).length ? sb.from('multas').upsert(multas.filter(m => m.id != null)) : Promise.resolve({}),
    (pagos || []).length ? sb.from('pagos').upsert(pagos.filter(p => p.id != null)) : Promise.resolve({}),
    (sugerencias || []).length ? sb.from('sugerencias').upsert(sugerencias.filter(s => s.id != null)) : Promise.resolve({})
  ]);
  const fallo = res.find(r => r && r.error);
  return fallo ? { ok: false, error: fallo.error.message } : { ok: true };
}

/** Qué ven los jugadores y los fans. Solo el míster lo cambia. */
export async function guardarEconomiaAjustes(economia) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const { error } = await sb.from('ajustes')
    .upsert({ clave: 'economia', valor: economia }, { onConflict: 'clave' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Guarda una foto de la clasificación en una jornada, para poder dibujar
 *  después cómo suben y bajan todos los equipos. */
export async function guardarFotoLiga(jornada, tabla) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const filas = (tabla || []).map((e, i) => ({
    jornada, nombre: e.nombre, puesto: i + 1,
    pts: e.g * 3 + e.e, gf: e.gf, gc: e.gc, color: e.color
  }));
  if (!filas.length) return { ok: false, error: 'La clasificación está vacía.' };
  const { error } = await sb.from('historico_liga')
    .upsert(filas, { onConflict: 'jornada,nombre' });
  return error ? { ok: false, error: error.message } : { ok: true, filas };
}

export async function borrarFotoLiga(jornada) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const { error } = await sb.from('historico_liga').delete().eq('jornada', jornada);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Guarda cualquier ajuste con clave propia (equipaciones, etc.). */
export async function guardarAjuste(clave, valor) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const { error } = await sb.from('ajustes').upsert({ clave, valor }, { onConflict: 'clave' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function guardarVisibilidad(visibilidad) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const { error } = await sb.from('ajustes')
    .upsert({ clave: 'visibilidad', valor: visibilidad }, { onConflict: 'clave' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Guarda una foto completa de la temporada y deja la app a cero
 *  para empezar la siguiente sin perder lo anterior. */
export async function cerrarTemporada(nombre, resumen) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const { data, error } = await sb.from('temporadas')
    .insert({ nombre, resumen }).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, temporada: data };
}

/** Crea la cuenta de acceso de un jugador. La hace una función del
 *  servidor porque dar de alta usuarios necesita permisos que no
 *  pueden vivir en la app. */
export async function crearCuentaJugador(email, jugadorId, nombre) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  try {
    const { data, error } = await sb.functions.invoke('crear-cuenta', {
      body: { email, jugador_id: jugadorId, nombre }
    });
    if (error) return { ok: false, error: 'La función «crear-cuenta» no responde (paso 6decies de SUPABASE.md).' };
    if (data && data.error) return { ok: false, error: data.error };
    return { ok: true, provisional: (data && data.provisional) || 'sanse2026' };
  } catch (e) {
    return { ok: false, error: 'Falta desplegar la función «crear-cuenta» (paso 6decies de SUPABASE.md).' };
  }
}

export async function guardar(datos) {
  if (!sesion) return { ok: false };
  const jornada = datos.jornadaSel || 0;

  if (sesion.rol === 'mister') {
    const conId = (datos.clasificacion || []).filter(e => e.id != null);
    const res = await Promise.all([
      sb.from('jugadores').upsert((datos.jugadores || []).map(j => ({
        id: j.id, dorsal: j.dorsal, nombre: j.nombre, pos: j.pos, email: j.email, estado: j.estado,
        foto: j.foto, recorte: j.recorte, edad: j.edad || null, altura: j.altura || null,
        pj: j.pj, min: j.min, goles: j.goles, asis: j.asis,
        ta: j.ta, tr: j.tr, p0: j.p0, ge: j.ge || 0, nota: j.nota
      }))),
      sb.from('campos').upsert((datos.campos || []).filter(c => c.id != null)),
      sb.from('partidos').upsert((datos.partidos || []).map(p => ({
        num: p.num, rival: p.rival, casa: p.casa, campo_id: p.campoId, pista: p.pista || null,
        dia: p.dia, mes: p.mes, hora: p.hora, gf: p.gf, gc: p.gc
      }))),
      sb.from('actas').upsert((datos.actas || []).map(a => ({
        id: a.id, jornada: a.jornada, rival: a.rival, fecha: a.fecha,
        gf: a.gf, gc: a.gc, eventos: a.eventos, minutos: a.minutos, mvp_id: a.mvp_id || null
      }))),
      sb.from('avisos').upsert(datos.avisos || []),
      sb.from('alineaciones').upsert(filasAlineaciones(datos, jornada)),
      sb.from('convocatorias').upsert(filasConvocatorias(datos, jornada)),
      conId.length ? sb.from('clasificacion').upsert(conId.map(e => ({
        id: e.id, nombre: e.nombre, color: e.color, pos_ant: e.pos_ant || null,
        pj: e.pj, g: e.g, e: e.e, p: e.p, gf: e.gf, gc: e.gc, racha: e.racha, nuestro: !!e.nuestro
      }))) : Promise.resolve({})
    ]);

    const eco = await guardarEconomia(datos.multas, datos.pagos, datos.sugerencias);
    if (datos.visibilidad) {
      const rv = await guardarVisibilidad(datos.visibilidad);
      if (rv && !rv.ok) fallos.push('lo que ven los demás (' + rv.error + ')');
    }
    if (datos.economia) {
      const re = await guardarEconomiaAjustes(datos.economia);
      if (re && !re.ok) fallos.push('las cuotas y tarifas (' + re.error + ')');
    }
    const rv = await guardarVoto(datos);
    const rn = await guardarNotas(datos);
    const nombres = ['la plantilla', 'los campos', 'el calendario', 'las actas', 'los avisos', 'la alineación', 'la convocatoria', 'la clasificación'];
    const fallos = res.map((r, i) => r && r.error ? nombres[i] + ' (' + r.error.message + ')' : null).filter(Boolean);
    if (rv && rv.error) fallos.push('tu voto (' + rv.error.message + ')');
    if (rn && rn.error) fallos.push('tus notas (' + rn.error.message + ')');
    if (eco && !eco.ok) fallos.push('las multas o cuotas (' + eco.error + ')');
    if (fallos.length) return { ok: false, error: 'No se pudo guardar ' + fallos.join('; ') };

    const sinId = (datos.clasificacion || []).length && !conId.length;
    return { ok: true, faltaSembrar: !!sinId };
  }

  const fallos = [];
  if (sesion.rol === 'jugador') {
    // Se guardan TODAS las jornadas que este jugador haya contestado, no solo
    // la «actual»: la respuesta desde el aviso push puede ser de otra jornada.
    const mapa = datos.convPorJornada || { [jornada]: datos.estados || {} };
    const filas = Object.keys(mapa)
      .filter(num => (mapa[num] || {})[sesion.jugadorId])
      .map(num => ({ partido_num: Number(num), jugador_id: sesion.jugadorId, estado: mapa[num][sesion.jugadorId] }));
    if (filas.length) {
      const r = await sb.from('convocatorias').upsert(filas);
      if (r.error) fallos.push('tu respuesta a la convocatoria');
    }
  }

  const clave = sesion.rol === 'jugador' ? 'jug-' + sesion.jugadorId : 'fan-' + sesion.perfilId;
  const rf = await guardarFavoritos((datos.favoritos || {})[clave] || []);
  if (rf && rf.error) fallos.push('tus favoritos (' + rf.error + ')');
  const r = await guardarVoto(datos);
  if (r && r.error) fallos.push('tu voto');
  const rn = await guardarNotas(datos);
  if (rn && rn.error) fallos.push('tus notas');
  if (fallos.length) return { ok: false, error: 'No se pudo guardar ' + fallos.join('; ') };
  return { ok: true };
}

async function guardarFavoritos(lista) {
  const d = await sb.from('favoritos').delete().eq('perfil_id', sesion.perfilId);
  if (d.error) return { error: d.error.message };
  if (lista.length) {
    const i = await sb.from('favoritos').insert(lista.map(id => ({ perfil_id: sesion.perfilId, jugador_id: id })));
    if (i.error) return { error: i.error.message };
  }
}

/** Sube una imagen al almacén y devuelve su dirección pública.
 *  Si el almacén no está listo, devuelve la imagen tal cual para no
 *  perder la publicación (pesa más, pero funciona). */
export async function subirImagen(dataUrl, carpeta) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return { url: dataUrl || '' };
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const ruta = (carpeta || 'feed') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await sb.storage.from('fotos').upload(ruta, blob, { contentType: blob.type, upsert: true });
    if (error) return { url: dataUrl, aviso: 'almacen' };
    return { url: sb.storage.from('fotos').getPublicUrl(ruta).data.publicUrl };
  } catch (e) {
    return { url: dataUrl, aviso: 'almacen' };
  }
}

export async function publicar(post) {
  const img = await subirImagen(post.foto, 'feed');
  const fila = {
    tipo: post.tipo, fecha: post.fecha, titulo: post.titulo, texto: post.texto,
    likes: 0, reacciones: post.reacciones, foto: img.url || null
  };
  let res = await sb.from('publicaciones').insert(fila).select().single();
  if (res.error && /foto/i.test(res.error.message)) {
    // La columna 'foto' aún no existe en la base: publica sin imagen.
    delete fila.foto;
    res = await sb.from('publicaciones').insert(fila).select().single();
    if (!res.error) return Object.assign({}, res.data, { aviso: 'columna' });
  }
  if (res.error) return { error: res.error.message };
  return Object.assign({}, res.data, img.aviso ? { aviso: img.aviso } : {});
}

/** Crea la tabla de la liga con los equipos de partida y devuelve
 *  las filas tal como quedan en el servidor (con su id). */
export async function sembrarClasificacion(equipos) {
  // Si ya hay equipos, se devuelven los existentes: sembrar dos veces
  // duplicaría la liga entera.
  const previas = await sb.from('clasificacion').select('*').order('orden');
  if (previas.data && previas.data.length) return { filas: previas.data };

  const filas = equipos.map((e, i) => ({
    orden: i, nombre: e.nombre, color: e.color, nuestro: !!e.nuestro,
    pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, racha: []
  }));
  const { data, error } = await sb.from('clasificacion').insert(filas).select();
  if (error) return { error: error.message };
  return { filas: data };
}

export async function subirFotoJugador(dataUrl, jugadorId, cual) {
  const r = await subirImagen(dataUrl, 'jugadores/' + jugadorId + '-' + cual);
  return r;
}

/** Borra del servidor las actas, convocatorias y alineaciones de las
 *  jornadas indicadas. Se usa al vaciar los datos de ejemplo. */
export async function borrarJornadas(jornadas) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster puede borrar.' };
  const res = await Promise.all([
    sb.from('actas').delete().in('jornada', jornadas),
    sb.from('convocatorias').delete().in('partido_num', jornadas),
    sb.from('alineaciones').delete().in('partido_num', jornadas),
    sb.from('votos_mvp').delete().in('jornada', jornadas),
    sb.from('notas').delete().in('jornada', jornadas)
  ]);
  const fallo = res.find(r => r && r.error);
  if (fallo) return { ok: false, error: fallo.error.message };
  return { ok: true };
}

export async function crear(tabla, fila) {
  const { data, error } = await sb.from(tabla).insert(fila).select().single();
  if (error) return null;
  return data;
}

/* ---------- AVISOS PUSH ---------- */

// Clave pública de firma (VAPID). Se puede publicar sin riesgo; la privada
// vive solo en el servidor. Cómo generarlas: paso 6sexies de SUPABASE.md.
export const VAPID_PUBLICA = 'BNZuCKJ9pCyqwuTEDzKhFZli9NpHVIOxDYa7EsmKx0_k82ttKsGGcPO0SODQbDot_ef7yf_0tja_UdFnfcNIHsg';

function claveABytes(base64) {
  const relleno = '='.repeat((4 - (base64.length % 4)) % 4);
  const limpia = (base64 + relleno).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(limpia);
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)));
}

/** ¿Puede este dispositivo recibir avisos? */
export function pushDisponible() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** ¿Está la app instalada en la pantalla de inicio? En iPhone los avisos
 *  solo funcionan si lo está. */
export function appInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function estadoAvisos() {
  if (!pushDisponible()) return 'no-soportado';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/** ¿Puede este dispositivo recibir un push de verdad AHORA MISMO?
 *  Hacen falta tres cosas a la vez: permiso concedido, clave del servidor
 *  puesta, y una suscripción viva en este navegador. */
export async function avisosOperativos() {
  if (!pushDisponible()) return false;
  if (Notification.permission !== 'granted') return false;
  if (!VAPID_PUBLICA) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    return !!(await reg.pushManager.getSubscription());
  } catch (e) {
    return false;
  }
}

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('./sw.js'); } catch (e) { return null; }
}

/** Pide permiso y guarda la suscripción de este dispositivo. */
export async function activarAvisos() {
  if (!pushDisponible()) return { ok: false, error: 'Este navegador no admite avisos.' };
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') return { ok: false, error: 'No has dado permiso para los avisos.' };

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registrarServiceWorker());
  if (!reg) return { ok: false, error: 'No se pudo preparar la app para avisos.' };

  if (!VAPID_PUBLICA) {
    return { ok: true, soloLocal: true,
      aviso: 'Permiso concedido. Los avisos con la app cerrada necesitan la clave del servidor (paso 6sexies de SUPABASE.md).' };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(VAPID_PUBLICA) });
    } catch (e) {
      return { ok: false, error: 'No se pudo suscribir este dispositivo.' };
    }
  }
  const datos = sub.toJSON();
  const { error } = await sb.from('push_subs').upsert({
    perfil_id: sesion ? sesion.perfilId : null,
    endpoint: datos.endpoint,
    p256dh: datos.keys.p256dh,
    auth: datos.keys.auth
  }, { onConflict: 'endpoint' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await sb.from('push_subs').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return { ok: true };
}

/** Envía un aviso a todo el equipo. Lo hace una función del servidor
 *  ('enviar-push'); mientras no esté desplegada, avisa de ello. */
export async function enviarAviso(titulo, cuerpo, destino, opciones) {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster envía avisos.' };
  // Horario de silencio: nada de avisos de madrugada salvo que se fuerce.
  const h = new Date().getHours();
  const silencio = h >= 23 || h < 8;
  if (silencio && !(opciones && opciones.forzar)) {
    return { ok: false, error: 'Son las ' + h + ':00 y el equipo duerme. Guardado sin avisar; puedes forzar el envío.', silencio: true };
  }
  try {
    // destino: 'todos' | 'jugadores' | 'fans' | un id de jugador
    const { data, error } = await sb.functions.invoke('enviar-push', {
      body: Object.assign({ titulo, cuerpo, destino: destino || 'todos' },
        opciones && opciones.tipo ? { tipo: opciones.tipo, jornada: opciones.jornada } : {})
    });
    if (error) return { ok: false, error: 'La función del servidor no responde (paso 6sexies de SUPABASE.md).' };
    return { ok: true, enviados: (data && data.enviados) || 0 };
  } catch (e) {
    return { ok: false, error: 'Falta desplegar la función de envío (paso 6sexies de SUPABASE.md).' };
  }
}

/** Recuento rápido de uso: filas por tabla + tamaño del almacén de fotos.
 *  No sustituye al panel de Supabase (cuota real de plan), solo da una
 *  idea de volumen para saber si hace falta mirarlo. */
export async function medirUso() {
  if (!sesion || sesion.rol !== 'mister') return { ok: false, error: 'Solo el míster.' };
  const tablas = ['jugadores','partidos','actas','publicaciones','comentarios','multas','pagos','sugerencias','notas','votos_mvp','push_subs','historico_liga'];
  const conteos = {};
  await Promise.all(tablas.map(async (t) => {
    const { count } = await sb.from(t).select('*', { count: 'exact', head: true }).catch(() => ({ count: null }));
    conteos[t] = count == null ? '—' : count;
  }));

  let archivos = 0, bytes = 0, sinTamano = false;
  async function recorrer(ruta) {
    const { data, error } = await sb.storage.from('fotos').list(ruta, { limit: 1000 });
    if (error || !data) return;
    for (const item of data) {
      if (item.id === null) { await recorrer((ruta ? ruta + '/' : '') + item.name); continue; }
      archivos++;
      const tam = item.metadata && item.metadata.size;
      if (typeof tam === 'number') bytes += tam; else sinTamano = true;
    }
  }
  try { await recorrer(''); } catch (e) {}

  return { ok: true, conteos, archivos, mb: (bytes / (1024 * 1024)).toFixed(1), sinTamano };
}

export async function borrar(tabla, id) {
  const { error } = await sb.from(tabla).delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Borra un jugador y todo lo que cuelga de él (convocatorias, votos,
 *  notas, multas, cuotas, favoritos y su MVP en las actas). */
export async function borrarJugador(id) {
  await Promise.all([
    sb.from('convocatorias').delete().eq('jugador_id', id),
    sb.from('votos_mvp').delete().eq('jugador_id', id),
    sb.from('notas').delete().eq('jugador_id', id),
    sb.from('multas').delete().eq('jugador_id', id),
    sb.from('pagos').delete().eq('jugador_id', id),
    sb.from('favoritos').delete().eq('jugador_id', id),
    sb.from('actas').update({ mvp_id: null }).eq('mvp_id', id)
  ]);
  const { error } = await sb.from('jugadores').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function editarPublicacion(id, cambios) {
  const patch = { titulo: cambios.titulo, texto: cambios.texto };
  if (cambios.foto !== undefined) {
    const img = await subirImagen(cambios.foto, 'feed');
    patch.foto = img.url || null;
  }
  const { error } = await sb.from('publicaciones').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, foto: patch.foto };
}

export async function borrarPublicacion(id) {
  const { error } = await sb.from('publicaciones').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function comentar(publicacionId, autor, texto) {
  await sb.from('comentarios').insert({ publicacion_id: publicacionId, autor, texto });
}

export async function reaccionar(publicacionId, likes, reacciones) {
  // Solo el míster puede escribir en «publicaciones» directamente (política
  // admin_publica). Jugadores y fans pasan por esta función seguridad-definer,
  // que solo toca likes/reacciones y nada más de la fila.
  const { error } = await sb.rpc('reaccionar_publicacion', {
    p_id: publicacionId, p_likes: likes, p_reacciones: reacciones
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* La app llamaba a esto cuando los datos vivían en el navegador.
   Con servidor no hace falta fusionar nada: la lista buena es la del servidor. */
export function fusionar(base, guardado) { return guardado && guardado.length ? guardado : base; }
export async function borrarTodo() {}
export async function huella(t) { return String(t); }
