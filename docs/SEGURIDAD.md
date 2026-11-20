# Seguridad y protección de datos personales

## Modelo de permisos (verificado en el servidor)

| Acción | Administrador | Operador | Sin sesión / inactivo |
|---|---|---|---|
| Ver conductores, motos, documentos, historial | ✅ | ✅ | ❌ |
| Registrar y editar conductores y motos | ✅ | ✅ | ❌ |
| Cargar y revisar documentos | ✅ | ✅ | ❌ |
| Asignar o cambiar moto | ✅ | ✅ | ❌ |
| Cambiar estado de afiliación | ✅ | Sólo si el admin lo habilita | ❌ |
| Eliminar documentos | ✅ | ❌ | ❌ |
| Borrar conductores o motos | ❌ (se desactivan) | ❌ | ❌ |
| Crear usuarios, cambiar roles, activar o desactivar | ✅ | ❌ | ❌ |
| Configuración y tipos de documento | ✅ | ❌ | ❌ |
| Editar o borrar auditoría o historial | ❌ | ❌ | ❌ |

Protecciones adicionales:
- Un administrador no puede quitarse su propio rol ni desactivarse.
- El sistema impide quedarse sin ningún administrador activo.
- Al desactivar un usuario también se bloquea en Auth, y pierde el acceso de inmediato.
- `created_by`, `updated_by`, `uploaded_by` y `reviewed_by` los asigna la base de datos, no el navegador.

## Datos personales: medidas aplicadas

Venezuela no tiene, a la fecha de este documento, una ley general de protección de datos personales. Los principios aplicables vienen principalmente de la **Constitución** (art. 28, *habeas data*, y art. 60, protección de la vida privada), de la jurisprudencia del TSJ sobre autodeterminación informativa y de la **Ley Especial contra los Delitos Informáticos**. El sistema aplica medidas alineadas con esos principios:

- **Finalidad limitada:** sólo se recogen datos necesarios para la gestión administrativa de la afiliación. La fecha de nacimiento y la cilindrada son opcionales.
- **Minimización en reportes:** las columnas con datos personales vienen desmarcadas y se marcan con un candado.
- **Acceso restringido:** sólo personal autorizado y con sesión activa.
- **Trazabilidad:** queda auditado quién creó, editó, consultó, descargó o exportó información.
- **Confidencialidad de archivos:** bucket privado, URL temporales, sin caché offline de datos.
- **Conservación del historial** sin borrado, para responder a solicitudes de acceso o rectificación (*habeas data*).

### Recomendaciones operativas

1. Informe a cada conductor, por escrito, qué datos se registran y para qué. Obtenga su consentimiento firmado y adjúntelo como documento «Otro documento del conductor».
2. Atienda las solicitudes de acceso o rectificación exportando su ficha PDF y corrigiendo desde «Editar expediente». El cambio queda auditado.
3. Use contraseñas de 12 o más caracteres y no comparta cuentas. Cada persona debe tener su propio usuario.
4. Desactive de inmediato a quien deje de trabajar en la administración.
5. Revise mensualmente el registro de auditoría (menú Auditoría → Exportación / Descarga).
6. Haga una consulta legal con un abogado local antes de ampliar el uso de los datos (por ejemplo, compartirlos con terceros).

## Lo que NO debe hacerse

- Colocar la clave `service_role` en `.env.local`, en GitHub o en el código.
- Hacer público el bucket `yummy-private`.
- Desactivar RLS en cualquier tabla.
- Subir respaldos, exportes o fotos al repositorio.
