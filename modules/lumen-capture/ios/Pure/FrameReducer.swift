import Accelerate

struct FrameReduction {
  // Means over the finger region, 0..1 of full scale.
  let r: Double
  let g: Double
  let b: Double
  let spatialStdR: Double
  let clipFrac: Double

  // Copied from config.ts. Only a live hint; core recomputes contact. Same test as core's frameProblem().
  // Clipping does not clear the hint, or a clipping finger would never get locked.
  var coversLens: Bool {
    [r, g, b].allSatisfy { (0.0...1.0).contains($0) } && spatialStdR.isFinite && clipFrac.isFinite
      && r >= 2.0 * (g + b) && r >= 0.30 && spatialStdR <= 0.10
  }
}

// Central 60% of the frame, every 4th row and pixel. One scratch row is reused so nothing is allocated per
// frame; the budget is 4 ms at 60 fps.
final class FrameReducer {
  static let regionFraction = 0.6
  static let step = 4
  // Red at or above 250 of 255 counts as clipped.
  static let clipLevel: Float = 250

  private var row: [Float] = []

  func reduce(bgra base: UnsafeRawPointer, width: Int, height: Int, bytesPerRow: Int) -> FrameReduction? {
    let marginX = Int(Double(width) * (1 - Self.regionFraction) / 2)
    let marginY = Int(Double(height) * (1 - Self.regionFraction) / 2)
    let columns = (width - 2 * marginX + Self.step - 1) / Self.step
    guard columns > 0, height - 2 * marginY > 0 else { return nil }
    if row.count < columns { row = [Float](repeating: 0, count: columns) }

    // 4 bytes per BGRA pixel, so the same channel of every 4th pixel is 16 bytes apart.
    let pixelStride = vDSP_Stride(4 * Self.step)
    let count = vDSP_Length(columns)
    var sumB = 0.0
    var sumG = 0.0
    var sumR = 0.0
    var sumSquaresR = 0.0
    var clipped = 0
    var rows = 0
    row.withUnsafeMutableBufferPointer { scratch in
      guard let values = scratch.baseAddress else { return }
      for y in stride(from: marginY, to: height - marginY, by: Self.step) {
        let pixels = base.advanced(by: y * bytesPerRow + 4 * marginX).assumingMemoryBound(to: UInt8.self)
        var sum: Float = 0
        vDSP_vfltu8(pixels, pixelStride, values, 1, count)
        vDSP_sve(values, 1, &sum, count)
        sumB += Double(sum)
        vDSP_vfltu8(pixels.advanced(by: 1), pixelStride, values, 1, count)
        vDSP_sve(values, 1, &sum, count)
        sumG += Double(sum)
        vDSP_vfltu8(pixels.advanced(by: 2), pixelStride, values, 1, count)
        vDSP_sve(values, 1, &sum, count)
        sumR += Double(sum)
        vDSP_svesq(values, 1, &sum, count)
        sumSquaresR += Double(sum)
        for index in 0..<columns where values[index] >= Self.clipLevel {
          clipped += 1
        }
        rows += 1
      }
    }
    guard rows > 0 else { return nil }
    let sampled = Double(rows * columns)
    let meanR = sumR / sampled
    let varianceR = max(0, sumSquaresR / sampled - meanR * meanR)
    return FrameReduction(
      r: meanR / 255,
      g: sumG / sampled / 255,
      b: sumB / sampled / 255,
      spatialStdR: varianceR.squareRoot() / 255,
      clipFrac: Double(clipped) / sampled
    )
  }
}
