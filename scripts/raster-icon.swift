import AppKit
// swift scripts/raster-icon.swift build/icon.svg build/icon.png [width height]: the icon centered on a transparent canvas
// (1024 × 1024 by default). The Microsoft Store tiles in build/appx/ come from here (see electron-builder.yml).
let args = CommandLine.arguments
let source = URL(fileURLWithPath: args[1])
guard let image = NSImage(contentsOf: source) else { fatalError("Cannot load icon SVG") }
let w = args.count > 4 ? Int(args[3])! : 1024, h = args.count > 4 ? Int(args[4])! : 1024, side = CGFloat(min(w, h))
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: NSRect(x: (CGFloat(w) - side) / 2, y: (CGFloat(h) - side) / 2, width: side, height: side))
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
