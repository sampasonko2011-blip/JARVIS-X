// swift-tools-version: 6.0
import PackageDescription
let package=Package(name:"ExocortexCore",platforms:[.iOS(.v16),.macOS(.v13)],products:[.library(name:"ExocortexCore",targets:["ExocortexCore"])],targets:[.target(name:"ExocortexCore"),.testTarget(name:"ExocortexCoreTests",dependencies:["ExocortexCore"])])
