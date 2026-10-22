Pod::Spec.new do |s|
  s.name           = 'CurfyScreenTime'
  s.version        = '0.1.0'
  s.summary        = 'Local Curfy Screen Time integration'
  s.description    = 'Privacy-preserving native selected-app shielding.'
  s.license        = 'MIT'
  s.author         = 'Curfy'
  s.homepage       = 'https://github.com/alvinkwak01/curfy'
  s.platforms      = { :ios => '16.0' }
  s.source         = { :git => 'https://github.com/alvinkwak01/curfy.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'FamilyControls', 'ManagedSettings', 'SwiftUI'
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.9'
end
