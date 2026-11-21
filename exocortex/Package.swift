// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Exocortex",
    platforms: [.iOS("16.4"), .macOS("13.3")],
    products: [
        .library(name: "ExocortexCore", targets: ["ExocortexCore"]),
        .library(name: "ExocortexLlamaNative", targets: ["ExocortexLlamaNative"]),
        .library(name: "ExocortexDeviceProbe", targets: ["ExocortexDeviceProbe"])
    ],
    dependencies: [
        .package(url: "https://github.com/mattt/llama.swift", exact: "3.0.0")
    ],
    targets: [
        .target(name: "ExocortexCore"),
        .target(name: "ExocortexDeviceProbe", dependencies: ["ExocortexCore"]),
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
