package app

import "net/http"

/*
registerFrontend monta en el mux las rutas del frontend.

- "/" y "/visitor" sirven el mismo index.html (el rol lo decide el JS según la URL).
- El resto del front vive en frontend/ y se sirve como directorio estático; el
  módulo Go vive en la raíz, así que la ruta es "frontend".

Para servir un archivo nuevo del front basta con ponerlo en frontend/.
*/

func registerFrontend(mux *http.ServeMux) {
	mux.HandleFunc("/visitor", indexHandler)
	mux.Handle("/", http.FileServer(http.Dir("frontend")))
}

// indexHandler sirve el HTML único de la app (host y visitor comparten página).
func indexHandler(writer http.ResponseWriter, request *http.Request) {
	http.ServeFile(writer, request, "frontend/index.html")
}
