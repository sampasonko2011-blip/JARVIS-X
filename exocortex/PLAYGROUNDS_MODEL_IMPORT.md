# Swift Playgrounds — choisir un modèle GGUF

Le modèle doit rester dans **Fichiers → Téléchargements**. Ne l'ajoute pas aux ressources du projet Playgrounds : cela peut dupliquer un fichier proche de 1 Go dans le paquet du projet.

Ajoute ce flux à la vue SwiftUI de ton projet Playgrounds (le package racine expose `ExocortexDeviceProbe`) :

```swift
import SwiftUI
import UniformTypeIdentifiers
import ExocortexDeviceProbe

struct ModelPickerView: View {
    @State private var showingImporter = false
    @State private var isRunning = false
    @State private var output = "Choisis le fichier Q4_K_M.gguf."

    var body: some View {
        VStack(spacing: 16) {
            Button("Choisir le modèle GGUF") {
                showingImporter = true
            }
            .disabled(isRunning)

            if isRunning {
                ProgressView("Benchmark CPU puis GPU…")
            }

            ScrollView {
                Text(output)
                    .font(.system(.footnote, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
        .fileImporter(
            isPresented: $showingImporter,
            allowedContentTypes: [.data],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let modelURL = urls.first,
                      modelURL.pathExtension.lowercased() == "gguf" else {
                    output = "Sélection invalide : choisis un fichier .gguf."
                    return
                }

                isRunning = true
                Task {
                    let report = await ExocortexDeviceProbe.runLlamaBenchmark(
                        modelURL: modelURL
                    )
                    await MainActor.run {
                        output = report.rendered
                        isRunning = false
                    }
                }

            case .failure(let error):
                output = "Import annulé ou impossible : \(error.localizedDescription)"
            }
        }
    }
}
```

## Sécurité d'accès au fichier

`runLlamaBenchmark(modelURL:)` appelle `startAccessingSecurityScopedResource()` et garde l'accès ouvert pendant les deux passes CPU → GPU. Il le libère avec `stopAccessingSecurityScopedResource()` à la sortie, y compris en cas d'erreur.

Si l'URL pointe déjà vers un fichier interne au conteneur de l'app, l'accès sécurisé peut ne pas être nécessaire ; le benchmark continue quand même. Le fichier n'est ni copié dans le projet ni téléversé.

## Avant de lancer

- Vérifie que le nom du fichier se termine par `.gguf` et que la quantification est bien Q4_K_M.
- Garde au moins plusieurs Go d'espace libre pour iPadOS et ses fichiers temporaires.
- Le benchmark est limité par défaut à 2 répétitions, 512 tokens de contexte et 128 tokens générés par passe.
- Arrête si l'iPad devient anormalement chaud ou si iPadOS affiche une alerte mémoire.
- Le paramètre `gpuLayers = -1` demande l'offload ; il ne prouve pas à lui seul que le GPU a réellement exécuté les couches.
- Ce guide décrit le flux attendu ; il ne prétend pas que l'import Swift Playgrounds ou l'inférence physique sur iPad ont déjà été testés.

