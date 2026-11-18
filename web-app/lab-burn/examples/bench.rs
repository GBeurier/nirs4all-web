//! Native timing and sanity check: `cargo run --release --example bench`.
use lab_burn_cnn::CnnRegressor;
use std::time::Instant;

fn main() {
    let (rows, len, branches) = (188usize, 256usize, 3usize);
    let cols = len * branches;
    let mut x = vec![0.0f64; rows * cols];
    let mut y = vec![0.0f64; rows];
    for r in 0..rows {
        let t = (r as f64 * 0.37).sin();
        y[r] = 50.0 + 30.0 * t;
        for j in 0..cols {
            let p = (j % len) as f64 / len as f64;
            x[r * cols + j] = (-(p - 0.4).powi(2) / 0.01).exp() * (1.0 + 0.5 * t) + 0.01 * ((r * 31 + j * 7) % 13) as f64;
        }
    }
    for arch in ["nicon", "compact"] {
        let config = format!(r#"{{"branch_kinds":[1,1,1],"branch_shapes":[{len},1,1,{len},1,1,{len},1,1],"architecture":"{arch}","epochs":40,"batch_size":64,"learning_rate":0.002,"seed":7}}"#);
        let mut model = CnnRegressor::new(&config).ok().unwrap();
        let t0 = Instant::now();
        model.fit(&x, rows, cols, &y).ok().unwrap();
        let fit = t0.elapsed();
        let pred = model.predict(&x, rows, cols).ok().unwrap();
        let rmse = (pred.iter().zip(&y).map(|(p, t)| (p - t).powi(2)).sum::<f64>() / rows as f64).sqrt();
        let state = model.export_state().ok().unwrap();
        let again = CnnRegressor::from_state(&state).ok().unwrap().predict(&x, rows, cols).ok().unwrap();
        let drift = pred.iter().zip(&again).map(|(a, b)| (a - b).abs()).fold(0.0, f64::max);
        println!("{arch}: fit {:.2?}, train RMSE {rmse:.3} (y sd 21), state {} bytes, replay max diff {drift:e}", fit, state.len());
    }
}
