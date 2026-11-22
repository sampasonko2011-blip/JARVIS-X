// swift-tools-version: 6.0
import PackageDescription

// Root entry point for Swift Playgrounds and Xcode package resolution.
// The canonical implementation remains organized under exocortex/.
let package = Package(
    name: "JARVISXExocortex",
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
        .target(name: "ExocortexCore", path: "exocortex/Sources/ExocortexCore"),
        .target(
            name: "ExocortexDeviceProbe",
            dependencies: ["ExocortexCore", "ExocortexLlamaNative"],
            path: "exocortex/Sources/ExocortexDeviceProbe"
        ),
        .target(
            name: "ExocortexLlamaNative",
            dependencies: [
                "ExocortexCore",
                .product(name: "LlamaSwift", package: "llama.swift")
            ],
            path: "exocortex/Sources/ExocortexLlamaNative"
        ),
        .testTarget(
            name: "ExocortexCoreTests",
            dependencies: ["ExocortexCore"],
            path: "exocortex/Tests/ExocortexCoreTests"
        ),
        .testTarget(
            name: "ExocortexLlamaNativeTests",
            dependencies: ["ExocortexCore", "ExocortexLlamaNative"],
            path: "exocortex/Tests/ExocortexLlamaNativeTests"
        )
    ]
)
