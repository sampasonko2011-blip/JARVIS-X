// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Exocortex",
    platforms: [.iOS(.v16_4), .macOS(.v13_3)],
    products: [
        .library(name: "ExocortexCore", targets: ["ExocortexCore"]),
        .library(name: "ExocortexLlamaNative", targets: ["ExocortexLlamaNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/mattt/llama.swift", exact: "3.0.0")
    ],
    targets: [
        .target(name: "ExocortexCore"),
        .target(
            name: "ExocortexLlamaNative",
            dependencies: [
                "ExocortexCore",
                .product(name: "LlamaSwift", package: "llama.swift")
            ]
        ),
        .testTarget(name: "ExocortexCoreTests", dependencies: ["ExocortexCore"]),
        .testTarget(
            name: "ExocortexLlamaNativeTests",
            dependencies: ["ExocortexCore", "ExocortexLlamaNative"]
        )
    ]
)
