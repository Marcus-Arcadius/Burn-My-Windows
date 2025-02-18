//////////////////////////////////////////////////////////////////////////////////////////
//          )                                                   (                       //
//       ( /(   (  (               )    (       (  (  (         )\ )    (  (            //
//       )\()) ))\ )(   (         (     )\ )    )\))( )\  (    (()/( (  )\))(  (        //
//      ((_)\ /((_|()\  )\ )      )\  '(()/(   ((_)()((_) )\ )  ((_)))\((_)()\ )\       //
//      | |(_|_))( ((_)_(_/(    _((_))  )(_))  _(()((_|_)_(_/(  _| |((_)(()((_|(_)      //
//      | '_ \ || | '_| ' \))  | '  \()| || |  \ V  V / | ' \)) _` / _ \ V  V (_-<      //
//      |_.__/\_,_|_| |_||_|   |_|_|_|  \_, |   \_/\_/|_|_||_|\__,_\___/\_/\_//__/      //
//                                 |__/                                                 //
//                       Copyright (c) 2021 Simon Schneegans                            //
//          Released under the GPLv3 or later. See LICENSE file for details.            //
//////////////////////////////////////////////////////////////////////////////////////////

// The content from common.glsl is automatically prepended to each shader effect.

uniform vec3 uColor;
uniform float uScale;

const float SHOWER_TIME  = 0.3;
const float SHOWER_WIDTH = 0.3;
const float STREAK_TIME  = 0.6;
const float EDGE_FADE    = 50;

// This method returns four values:
//  result.x: A mask for the particles which lead the shower.
//  result.y: A mask for the streaks which follow the shower particles.
//  result.z: A mask for the final "atom" particles.
//  result.w: The opacity of the fading window.
vec4 getMasks(float progress) {
  float showerProgress = progress / SHOWER_TIME;
  float streakProgress = clamp((progress - SHOWER_TIME) / STREAK_TIME, 0, 1);
  float fadeProgress   = clamp((progress - SHOWER_TIME) / (1.0 - SHOWER_TIME), 0, 1);

  // Gradient from top to bottom.
  float t = cogl_tex_coord_in[0].t;

  // A smooth gradient which moves to the bottom within the showerProgress.
  float showerMask =
    smoothstep(1, 0, abs(showerProgress - t - SHOWER_WIDTH) / SHOWER_WIDTH);

  // This is 1 above the streak mask.
  float streakMask = (showerProgress - t - SHOWER_WIDTH) > 0 ? 1 : 0;

  // Compute mask for the "atom" particles.
  float atomMask = getRelativeEdgeMask(0.2);
  atomMask       = max(0, atomMask - showerMask);
  atomMask *= streakMask;
  atomMask *= sqrt(1 - fadeProgress * fadeProgress);

  // Make some particles visible in the streaks.
  showerMask += 0.05 * streakMask;

  // Add shower mask to streak mask.
  streakMask = max(streakMask, showerMask);

  // Fade-out the masks at the window edges.
  float edgeFade = getAbsoluteEdgeMask(EDGE_FADE, 0.5);
  streakMask *= edgeFade;
  showerMask *= edgeFade;

  // Fade-out the masks from top to bottom.
  float fade = smoothstep(0.0, 1.0, 1.0 + t - 2.0 * streakProgress);
  streakMask *= fade;
  showerMask *= fade;

  // Compute fading window opacity.
  float windowMask = pow(1.0 - fadeProgress, 2.0);

  if (uForOpening) {
    windowMask = 1.0 - windowMask;
  }

  return vec4(showerMask, streakMask, atomMask, windowMask);
}

void main() {
  float progress = easeOutQuad(uProgress);

  vec4 masks       = getMasks(progress);
  vec4 windowColor = texture2D(uTexture, cogl_tex_coord_in[0].st);

  // Shell.GLSLEffect uses straight alpha. So we have to convert from premultiplied.
  if (windowColor.a > 0) {
    windowColor.rgb /= windowColor.a;
  }

  // Dissolve window to effect color / transparency.
  cogl_color_out.rgb = mix(uColor, windowColor.rgb, 0.5 * masks.w + 0.5);
  cogl_color_out.a   = windowColor.a * masks.w;

  // Add leading shower particles.
  vec2 showerUV = cogl_tex_coord_in[0].st + vec2(0, -0.7 * progress / SHOWER_TIME);
  showerUV *= 0.02 * uSize / uScale;
  float shower = pow(simplex2D(showerUV), 10.0);
  cogl_color_out.rgb += uColor * shower * masks.x;
  cogl_color_out.a += shower * masks.x;

  // Add trailing streak lines.
  vec2 streakUV = cogl_tex_coord_in[0].st + vec2(0, -progress / SHOWER_TIME);
  streakUV *= vec2(0.05 * uSize.x, 0.001 * uSize.y) / uScale;
  float streaks = simplex2DFractal(streakUV) * 0.5;
  cogl_color_out.rgb += uColor * streaks * masks.y;
  cogl_color_out.a += streaks * masks.y;

  // Add glimmering atoms.
  vec2 atomUV = cogl_tex_coord_in[0].st + vec2(0, -0.025 * progress / SHOWER_TIME);
  atomUV *= 0.2 * uSize / uScale;
  float atoms = pow((simplex3D(vec3(atomUV, uTime))), 5.0);
  cogl_color_out.rgb += uColor * atoms * masks.z;
  cogl_color_out.a += atoms * masks.z;

  // These are pretty useful for understanding how this works.
  // cogl_color_out = vec4(masks.rgb, 1.0);
  // cogl_color_out = vec4(vec3(masks.x), 1.0);
  // cogl_color_out = vec4(vec3(masks.y), 1.0);
  // cogl_color_out = vec4(vec3(masks.z), 1.0);
  // cogl_color_out = vec4(vec3(masks.w), 1.0);
  // cogl_color_out = vec4(vec3(shower), 1.0);
  // cogl_color_out = vec4(vec3(streaks), 1.0);
  // cogl_color_out = vec4(vec3(atoms), 1.0);
}