# Guía del profesor — Edukors Slides Editor

Esta guía muestra cómo crear una presentación en Edukors Slides Editor, desde la primera diapositiva hasta el archivo listo para presentar. No necesita escribir HTML: todo se hace en la propia diapositiva y con el asistente de IA.

## 1. La idea en una frase

Una presentación es un conjunto de **diapositivas**, cada una una pequeña página web, que comparten una misma apariencia: la **base** (colores, fuentes y lo que queda detrás de todas las diapositivas) y los **diseños** (la organización del contenido). El editor guarda todo en un archivo `.eslx` y exporta **un único HTML** que se abre en cualquier navegador, incluso sin internet.

## 2. Instalar y abrir

**En Mac** (Apple Silicon o Intel, macOS 13 o posterior):

1. Descargue [`Edukors-Slides-Editor-mac.dmg`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-mac.dmg), ábralo y arrastre la app a la carpeta **Aplicaciones**.
2. Abra la app. La primera vez, macOS pregunta si desea abrir una app descargada de Internet: haga clic en **Abrir**.

**En Windows** (10 u 11, 64 bits):

1. Abra la página del editor en Microsoft Store, [Edukors Slides Editor](https://apps.microsoft.com/detail/9PHLLNHZW4Z2), y haga clic en **Obtener**. Sin avisos y sin contraseña de administrador.
2. El editor queda en el menú Inicio. Las versiones nuevas llegan por Microsoft Store, como las de cualquier app instalada desde ella.

Sin Microsoft Store (algunos equipos escolares la tienen desactivada), use el instalador [`Edukors-Slides-Editor-windows.exe`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-windows.exe). Si el navegador desconfía del archivo, elija **Conservar**; si Windows muestra **Windows protegió su PC**, haga clic en **Más información** y luego en **Ejecutar de todas formas**.

**En Linux** (64 bits, x64):

- En **Ubuntu, Debian, Mint** y derivados, descargue [`Edukors-Slides-Editor-linux.deb`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.deb) e instálelo con doble clic (o `sudo apt install ./Edukors-Slides-Editor-linux.deb`). El editor queda en el menú de aplicaciones, y un `.eslx` se abre en él con doble clic.
- En **otras distribuciones**, descargue [`Edukors-Slides-Editor-linux.AppImage`](https://github.com/mgarlabx/edukors_slides_editor/releases/latest/download/Edukors-Slides-Editor-linux.AppImage), márquelo como ejecutable (`chmod +x`) y ábralo. Funciona sin instalar.

Cuando sale una versión nueva, el propio editor lo avisa y ofrece su página de descarga (en Microsoft Store, la actualización llega por la tienda).

**En todos los sistemas**, la primera vez, el editor muestra los **Términos de uso** (la licencia MIT, explicada): hay que aceptarlos para continuar. Después quedan en la **Ayuda**, que también muestra la versión del editor. A partir de ahí puede crear una **Nueva presentación** o **Abrir** un archivo `.eslx`. Una vez instalado, un `.eslx` se abre en el editor con doble clic.

**Archivos de otras versiones y de PowerPoint.** **Abrir** también acepta presentaciones `.esf` (de versiones anteriores del editor) y `.pptx` (PowerPoint). Se abren convertidas, en una pestaña sin archivo: el original nunca se modifica, y **Guardar** pide un nombre para grabar un `.eslx` nuevo. La conversión de PowerPoint trae textos, imágenes y formas simples; lo que no se pudo convertir aparece en un aviso sobre la diapositiva, guardado con la presentación.

## 3. La pantalla

| Parte | Qué hace |
| --- | --- |
| **Barra superior** | Archivo (nueva, abrir, recientes, guardar, exportar, mostrar en la carpeta), **Presentar** y el cambio entre **Diapositivas** y **Patrón de diapositivas**, deshacer y rehacer, edición (cortar, copiar, pegar, duplicar, eliminar), **Insertar** (texto, forma, imagen, enlace, pregunta interactiva), Configuración y Ayuda. A la derecha, la lista de diapositivas (⌥⌘0) y el **asistente de IA** (⇧⌘A). |
| **Pestañas** (justo debajo) | Una presentación abierta por pestaña. El punto en la pestaña indica cambios sin guardar; **+** crea otra presentación. |
| **Barra de formato** | Fuente, tamaño, color, negrita, cursiva, subrayado, línea, relleno, sombra y recorte del objeto seleccionado. |
| **Lista de diapositivas** (izquierda) | Las miniaturas, con una barra para crear, mover, duplicar, copiar, cortar, pegar y eliminar diapositivas. |
| **Diapositiva** (centro) | La diapositiva en edición; debajo, las **notas del presentador**. |
| **Asistente de IA** (derecha) | La conversación con el agente que crea y cambia las diapositivas. |
| **Barra de estado** | Si está guardado, el número de la diapositiva y su **diseño** (clic para cambiarlo), y la versión del editor. |

El tema (claro, oscuro o el del sistema), el tamaño de letra de la interfaz y el idioma están en **Configuración → Aplicación**.

La lista de diapositivas y el asistente de IA cambian de ancho: arrastre el borde interior del panel (o use las flechas con él enfocado); un doble clic en el borde vuelve al ancho predeterminado.

## 4. Crear una presentación, paso a paso

1. **Nueva presentación.** Haga clic en el icono de nueva presentación (o pulse ⌘N) y elija una plantilla: *Blank presentation* (en blanco) o una de sus plantillas. Doble clic, o **Crear**, la abre.
2. **Añada diapositivas.** El botón de nueva diapositiva, arriba de la lista (o ⇧⌘N), muestra los diseños: elija uno con doble clic o **Insertar**.
3. **Escriba.** Haga clic en un texto de la diapositiva para editarlo allí mismo.
4. **Pida al asistente.** Abra el asistente (⇧⌘A) y describa lo que quiere: "crea tres diapositivas sobre el ciclo del agua para 6.º grado". Vea la sección 7.
5. **Guarde** con ⌘S. La primera vez, el editor pregunta dónde y con qué nombre: toda la presentación queda en un solo archivo, `mi-clase.eslx`, que puede copiar, mover y renombrar libremente.

El archivo guarda solo lo que la presentación usa (las imágenes y fuentes que ninguna diapositiva cita salen al guardar), por eso queda pequeño. Mientras hay cambios sin guardar, el editor conserva un borrador: si se cierra de repente, al abrir de nuevo ofrece **Recuperar**. Si el archivo cambia fuera del editor (otro programa, una sincronización), pregunta antes de grabar encima.

Para reutilizar una apariencia, abra la galería de **Nueva presentación** con la presentación abierta y use **Guardar como plantilla**: la plantilla aparece en la galería, donde también se renombra y elimina.

## 5. Editar en la diapositiva

La diapositiva funciona como en PowerPoint o Google Slides:

- **Seleccionar.** Haga clic en un objeto (texto, imagen, forma, enlace) para seleccionarlo; ⇧ o ⌘ + clic añade otro; arrastrar desde un espacio vacío selecciona todo lo que quede dentro del rectángulo. ⌘A selecciona todos los objetos de la diapositiva. Tab recorre los objetos.
- **Mover.** Arrastre el objeto (un texto, por el borde). Guías rosas muestran la alineación con bordes y centros; mantenga ⌥ para desactivar el ajuste y ⇧ para mover en un solo eje. Las flechas mueven 1 px (⇧, 10 px).
- **Redimensionar.** Tire de los tiradores blancos; una imagen mantiene la proporción (⇧ la libera). ⌘ + flechas también redimensionan. Con varios objetos seleccionados, los tiradores del contorno del grupo los redimensionan todos juntos.
- **Texto.** Haga clic dentro de un texto para editarlo, manteniendo el formato. Seleccione un fragmento para cambiar la fuente, el tamaño o el color en la barra de formato.
- **Imágenes.** **Insertar → Imagen** pega la imagen copiada o, si no la hay, pide un archivo; también puede arrastrar imágenes del equipo a la diapositiva. Si el diseño tiene un espacio de imagen vacío, la imagen va a él. El botón de recorte abre un cuadro con tiradores: Enter confirma, Esc cancela.
- **Formas y enlaces.** La forma elegida entra en la diapositiva con línea y relleno ajustables. El enlace usa la dirección copiada; la leyenda reemplaza la dirección en la diapositiva, y la opción **Código QR** pone el código al lado.
- **Orden y alineación.** El clic derecho en un objeto ofrece **Traer al frente**, **Enviar al fondo** y, en los textos, la alineación horizontal y vertical.
- **Copiar entre diapositivas y presentaciones.** Los objetos copiados (⌘C) se pegan (⌘V) en otra diapositiva, incluso de otra presentación, con la misma apariencia y las animaciones.

Cada gesto es un paso de deshacer (⌘Z). Solo Esc cancela un gesto en curso.

**Las diapositivas en la lista.** Haga clic en una miniatura para ir a la diapositiva; ⇧ y ⌘ seleccionan varias. Con la lista en foco, ⌫ elimina las diapositivas seleccionadas, ⌘D las duplica y ⌘C/⌘V las copian (también a otra presentación, que les da su propia apariencia). ⌘↑ y ⌘↓ cambian el orden; Inicio y Fin van a la primera y a la última. La última zona en la que hizo clic decide: después de hacer clic en la diapositiva, ⌫ y ⌘D actúan sobre los objetos, no sobre las diapositivas.

## 6. Patrón de diapositivas: bases y diseños

**Patrón de diapositivas**, junto a Presentar en la barra superior, cambia la lista de diapositivas por dos pestañas:

- **Bases.** Cada base es una apariencia alternativa de toda la presentación: colores, fuentes y los objetos que quedan detrás de todas las diapositivas (un logotipo, una franja). La base seleccionada en el panel es la **activa** (marcada con ✓ debajo de la miniatura) y vale para todas las diapositivas. Así puede probar otra apariencia sin tocar el contenido.
- **Diseños.** Cada diseño es una organización del contenido (portada, título y texto, dos columnas…), compartida por todas las bases. Una diapositiva nueva parte de un diseño. Lo que viene del diseño solo se cambia aquí, y el cambio llega a todas las diapositivas que lo usan; en las diapositivas, solo se editan los textos e imágenes de los espacios del diseño.

Renombre con doble clic en el nombre. La presentación siempre conserva al menos una base y un diseño; las diapositivas de un diseño eliminado pasan al anterior, con su contenido. Para **cambiar el diseño** de una diapositiva, haga clic en su nombre en la barra de estado: los textos van a los campos del mismo nombre del nuevo diseño.

Los detalles de código (HTML y CSS de bases y diseños) quedan para el asistente: pida "pon los títulos en azul marino en todas las diapositivas" o "crea un diseño con imagen a la izquierda y texto a la derecha".

## 7. El asistente de IA

El botón del asistente, en el extremo derecho de la barra superior (o ⇧⌘A), abre y cierra el **asistente** junto a la diapositiva; cerrarlo no interrumpe ni borra la conversación. Ve la presentación y la cambia a pedido: crea y reescribe diapositivas, cambia la apariencia y trae imágenes de la web. Trabaja solo en la presentación de esa conversación, en una carpeta propia del editor (no en la carpeta de su archivo), y nunca elimina diapositivas: eso queda en sus manos.

**Antes de usarlo.** Instale en su equipo [Claude Code](https://claude.com/claude-code) o [Codex](https://developers.openai.com/codex/cli/); el editor no los descarga. Después, en **Configuración → Asistente de IA**, agregue una cuenta e inicie sesión en el navegador. La cuenta es suya, no del editor, y sirve para las demás apps Edukors de este equipo.

**Cómo pedir.** Escriba en el campo de abajo y envíe. Las diapositivas seleccionadas van con el pedido, por eso "esta diapositiva" significa la seleccionada; en el Patrón de diapositivas, el asistente sabe qué base o diseño está viendo. Ejemplos:

- "Crea una portada y tres diapositivas sobre fracciones para 6.º grado."
- "Reescribe esta diapositiva con frases más cortas."
- "Haz una animación que muestre los pasos uno a uno."
- "Trae una foto del ciclo del agua y ponla a la derecha."
- "Cambia la fuente de toda la presentación por una más legible."

El **+** del campo adjunta archivos (textos, PDF, imágenes), elige una skill o un servidor MCP y activa o desactiva la búsqueda web. Cuando el pedido admite más de un camino, pregunta con opciones en el chat.

**Cada cambio se verifica y se deshace.** El editor verifica cada cambio que propone el asistente; lo que no pase vuelve a él para corregirlo. Cada cambio aplicado es **un paso de deshacer** (⌘Z). En el modo **revisar antes de aplicar**, usted aprueba cada cambio. El asistente no guarda el archivo: guárdelo usted, con ⌘S.

**Instrucciones permanentes.** Sus instrucciones para todas las presentaciones están en **Configuración → Asistente de IA**, con los servidores MCP y las skills. El contexto de esta charla (público, objetivos, fuentes) está en **Configuración → Esta presentación**, guardado en el propio `.eslx`.

**Modelo, esfuerzo y consumo.** Junto a Enviar están el modo, el modelo y el **esfuerzo** (más esfuerzo, respuestas más cuidadosas y lentas, con más consumo). Debajo, el uso de la ventana de 5 horas de la suscripción.

**Conversaciones.** El historial, arriba del panel, reabre conversaciones anteriores (con búsqueda); una nueva conversación empieza otra. Las conversaciones quedan guardadas en la presentación.

**Detener.** Mientras el asistente trabaja, **Detener** interrumpe el pedido; los cambios que ya aplicó se quedan y se deshacen con ⌘Z.

## 8. Preguntas interactivas

**Insertar → Pregunta interactiva** convierte la diapositiva en una pregunta en vivo: **opción múltiple**, **nube de palabras** o **respuesta abierta**. En el HTML exportado, usted desbloquea la pregunta con su clave de presentador, el público escanea el código QR y responde con el móvil, y los resultados aparecen como barras, nube o lista, con descarga en CSV.

Las respuestas pasan por un servidor de preguntas que **usted o su institución alojan** (PHP y MySQL, con guía de instalación en el [repositorio](https://github.com/mgarlabx/edukors_slides_editor)). Indique su dirección en **Configuración → Preguntas interactivas** y use **Probar conexión**. Sin servidor, la presentación con preguntas no se puede exportar a HTML: el diálogo de exportación muestra un aviso con el acceso a la configuración (PDF y PPTX siguen disponibles).

## 9. Presentar y exportar

**Presentar** (⌘↵) muestra la presentación desde la diapositiva seleccionada, solo con la navegación, para ensayar.

**Exportar** (⌘E) genera:

| Formato | Qué recibe |
| --- | --- |
| **HTML** (recomendado) | Un solo archivo, con imágenes, fuentes y animaciones, que se abre en cualquier navegador, incluso sin internet (solo las preguntas interactivas usan la red). |
| **PDF** | Una página por diapositiva, como imagen. |
| **PPTX** | Una presentación de PowerPoint editable: los textos, imágenes y formas se convierten en objetos nativos (fuente, tamaño, color, alineación, enlaces); lo que no tiene equivalente (degradados, decoraciones de la base, dibujos libres) va como imagen de fondo de cada diapositiva. Las animaciones y las preguntas interactivas no se exportan. |

El archivo exportado queda junto a la presentación, con el mismo nombre; si ya existe un archivo con ese nombre, el editor pregunta antes de reemplazarlo.

**En el HTML exportado**, las flechas, la barra espaciadora y Av Pág/Re Pág cambian de diapositiva. Lleve el ratón a una esquina superior para ver las herramientas: **panel del presentador** (se abre en otra ventana, con todas las diapositivas y la actual destacada), **lápiz**, **resaltador**, **texto**, **borrador**, **lupa**, **pizarra** infinita y **pantalla completa**. Una esquina inferior muestra la pista de diapositivas, con vista previa al pasar el ratón. Los controles del HTML están siempre en inglés, sea cual sea el idioma del editor.

## 10. Atajos

En Windows y Linux, ⌘ corresponde a Ctrl, ⌥ a Alt y ⇧ a Shift.

| Atajo | Acción |
| --- | --- |
| ⌘N / ⌘O / ⌘S / ⇧⌘S | Nueva, abrir, guardar, guardar como |
| ⌘W | Cerrar la pestaña |
| ⌘1 … ⌘9 | Ir a la pestaña 1 … 9 |
| ⌘Z / ⇧⌘Z | Deshacer / rehacer |
| ⌘X / ⌘C / ⌘V | Cortar, copiar y pegar (diapositivas u objetos, según la última zona en la que hizo clic) |
| ⌘D | Duplicar diapositivas u objetos |
| ⌫ | Eliminar diapositivas u objetos |
| ⌘A | Seleccionar todas las diapositivas o todos los objetos de la diapositiva |
| ⇧⌘N | Nueva diapositiva |
| ⌘↑ / ⌘↓ | Mover la diapositiva arriba / abajo |
| Flechas / ⇧ + flechas | Mover el objeto 1 px / 10 px |
| ⌘ + flechas | Redimensionar el objeto |
| ⌘↵ | Presentar |
| ⌘E | Exportar |
| ⌥⌘0 | Mostrar / ocultar la lista de diapositivas |
| ⇧⌘A | Abrir / cerrar el asistente de IA |
| ⌘= / ⌘− / ⌘0 | Acercar / alejar / tamaño real de la diapositiva |
| ⇧⌘+ / ⇧⌘− | Letra de la interfaz más grande / más pequeña |
| ⌘, | Configuración |
| Esc | Cancelar el gesto en curso |
