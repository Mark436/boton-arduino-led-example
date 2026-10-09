package main

import "net/http"

/*
registerFrontend monta en el mux las rutas del frontend.

- "/" y "/visitor" sirven el mismo index.html (el rol lo decide el JS según la URL).
- El resto del front vive en src/ y se sirve como directorio estático; como el
  backend está en backend/, la ruta es "../src".

Para servir un archivo nuevo del front basta con ponerlo en src/.
*/

func registerFrontend(mux *http.ServeMux) {
	mux.HandleFunc("/visitor", indexHandler)
	mux.Handle("/", http.FileServer(http.Dir("../src")))
}

// indexHandler sirve el HTML único de la app (host y visitor comparten página).
func indexHandler(writer http.ResponseWriter, request *http.Request) {
	http.ServeFile(writer, request, "../src/index.html")
}
